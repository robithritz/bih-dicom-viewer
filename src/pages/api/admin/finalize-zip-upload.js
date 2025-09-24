import fs from 'fs';
import path from 'path';
import yauzl from 'yauzl';
import { requireAdminAuth } from '../../../lib/auth-middleware';
import { UploadSessionManager, ExtractionSessionManager } from '../../../lib/zip-session-manager';
import { PrismaClient } from '@prisma/client';
import { getDicomFiles, organizeDicomStudies } from '../../../lib/dicom';

// Directories
const TEMP_DIR = path.join(process.cwd(), 'temp', 'zip-chunks');
const DICOM_DIR = path.join(process.cwd(), 'DICOM');

// Prisma client will be initialized per operation

// Ensure DICOM directory exists
if (!fs.existsSync(DICOM_DIR)) {
  fs.mkdirSync(DICOM_DIR, { recursive: true });
}

/**
 * Process DICOM studies and save to database
 */
async function processDicomStudies(folderName, sessionId, uploadedBy) {
  let prismaClient = null;

  try {
    console.log(`📊 Processing DICOM studies for folder: ${folderName}`);

    // Create a new Prisma client instance for this operation
    prismaClient = new PrismaClient();

    // Update extraction status
    ExtractionSessionManager.update(sessionId, {
      stage: 'Processing DICOM studies',
      message: 'Analyzing DICOM files and saving to database...'
    });

    // Get DICOM files from the extracted folder
    console.log(`🔍 Looking for DICOM files in folder: ${folderName}`);
    const files = getDicomFiles(folderName);
    console.log(`📁 Found ${files.length} DICOM files:`, files.slice(0, 5)); // Log first 5 files

    if (files.length === 0) {
      console.log(`⚠️ No DICOM files found in folder: ${folderName}`);
      return { studiesProcessed: 0, studiesSkipped: 0 };
    }

    // Organize files into studies
    console.log(`🔄 Organizing ${files.length} files into studies...`);
    const studies = organizeDicomStudies(files);
    const studyEntries = Object.entries(studies);

    console.log(`📚 Found ${studyEntries.length} DICOM studies in ${files.length} files`);
    console.log(`📋 Study UIDs:`, studyEntries.map(([uid]) => uid));

    let studiesProcessed = 0;
    let studiesSkipped = 0;

    // Extract patient ID from folder name (format: patientId_episodeId)
    const uploadedPatientId = folderName.split('_')[0];
    console.log(`👤 Extracted patient ID: ${uploadedPatientId} from folder: ${folderName}`);

    for (const [studyInstanceUID, study] of studyEntries) {
      try {
        console.log(`🔍 Processing study: ${studyInstanceUID}`);
        console.log(`📊 Study data:`, {
          patientName: study.patientName,
          patientID: study.patientID,
          studyDate: study.studyDate,
          modality: study.modality,
          firstFile: study.firstFile
        });

        // Calculate total files and series
        const totalFiles = study.files ? study.files.length : 0;
        const totalSeries = study.series ? Object.keys(study.series).length : 0;

        // Prepare study data for database
        const studyData = {
          studyInstanceUID,
          patientName: study.patientName || null,
          patientID: study.patientID || null,
          studyDate: study.studyDate || null,
          studyTime: study.studyTime || null,
          studyDescription: study.studyDescription || null,
          modality: study.modality || null,
          thumbnail: study.thumbnail || null,
          firstFile: study.firstFile,
          uploadedPatientId,
          uploadedFolderName: folderName,
          totalFiles,
          totalSeries,
          active: true
        };

        // Check if study already exists
        const existingStudy = await prismaClient.dicomStudy.findUnique({
          where: { studyInstanceUID }
        });

        let createdStudy = {};
        if (existingStudy) {
          createdStudy = await prismaClient.dicomStudy.update({
            where: { studyInstanceUID },
            data: {

              ...studyData,
              uploadedBy: uploadedBy || null,
              updatedAt: new Date()
            }
          });
        } else {
          // Insert study into database
          createdStudy = await prismaClient.dicomStudy.create({
            data: {
              ...studyData,
              uploadedBy: uploadedBy || null
            }
          });
        }

        console.log(`✅ Saved study to database with ID: ${createdStudy.id}, UID: ${studyInstanceUID}`);
        studiesProcessed++;

        // Update progress
        ExtractionSessionManager.update(sessionId, {
          message: `Processed ${studiesProcessed + studiesSkipped}/${studyEntries.length} studies...`
        });

      } catch (studyError) {
        console.error(`❌ Error processing study ${studyInstanceUID}:`, studyError);
        console.error(`❌ Study error stack:`, studyError.stack);
        studiesSkipped++;
      }
    }

    console.log(`📊 DICOM processing complete: ${studiesProcessed} processed, ${studiesSkipped} skipped`);

    return { studiesProcessed, studiesSkipped };

  } catch (error) {
    console.error('❌ Error processing DICOM studies:', error);
    console.error('❌ Processing error stack:', error.stack);
    throw error;
  } finally {
    if (prismaClient) {
      await prismaClient.$disconnect();
      console.log('🔌 Prisma client disconnected');
    }
  }
}



/**
 * Assemble chunks into complete ZIP file
 */
async function assembleZipFile(sessionId, session) {
  const sessionDir = path.join(TEMP_DIR, sessionId);
  const assembledZipPath = path.join(sessionDir, 'assembled.zip');

  // Create write stream for assembled file
  const writeStream = fs.createWriteStream(assembledZipPath);

  try {
    // Write chunks in order
    for (let i = 0; i < session.totalChunks; i++) {
      const chunkPath = session.chunkPaths.get(i);
      if (!chunkPath || !fs.existsSync(chunkPath)) {
        throw new Error(`Missing chunk ${i}`);
      }

      const chunkData = fs.readFileSync(chunkPath);
      writeStream.write(chunkData);
    }

    writeStream.end();

    // Wait for write to complete
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    return assembledZipPath;

  } catch (error) {
    writeStream.destroy();
    throw error;
  }
}

/**
 * Extract ZIP file and nested ZIPs, writing all DICOM files into target folder
 */
async function extractZipFile(zipPath, folderName, sessionId, uploadedBy) {
  // Ensure target folder (unique if exists)
  let finalFolderName = folderName;
  let targetDir = path.join(DICOM_DIR, finalFolderName);
  if (fs.existsSync(targetDir)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    finalFolderName = `${folderName}-${timestamp}`;
    targetDir = path.join(DICOM_DIR, finalFolderName);
    console.log(`📁 Folder ${folderName} already exists, using ${finalFolderName} instead`);
  }
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    console.log(`📁 Created directory: ${targetDir}`);
  }

  ExtractionSessionManager.update(sessionId, {
    stage: 'Extracting ZIP file',
    message: `Opening ZIP archive (with nested zips)... Target: ${finalFolderName}`
  });

  const counters = { entriesSeen: 0, dicomFiles: 0 };

  async function extractSingleZip(zipFilePath) {
    const nestedDir = path.join(targetDir, '__nested__');
    if (!fs.existsSync(nestedDir)) fs.mkdirSync(nestedDir, { recursive: true });

    await new Promise((resolve, reject) => {
      yauzl.open(zipFilePath, { lazyEntries: true }, (err, zipfile) => {
        if (err) return reject(new Error(`Failed to open ZIP file: ${err.message}`));

        const nestedZipPaths = [];
        zipfile.readEntry();

        zipfile.on('entry', (entry) => {
          counters.entriesSeen++;

          // Skip directories
          if (/\/$/.test(entry.fileName)) {
            zipfile.readEntry();
            return;
          }

          const base = path.basename(entry.fileName);
          const ext = path.extname(base).toLowerCase();

          // If entry is another zip, write it out and process later
          if (ext === '.zip') {
            zipfile.openReadStream(entry, (err, rs) => {
              if (err) { zipfile.readEntry(); return; }
              let outPath = path.join(nestedDir, base);
              let c = 1;
              while (fs.existsSync(outPath)) {
                const nameNoExt = path.basename(base, ext);
                outPath = path.join(nestedDir, `${nameNoExt}_${c}${ext}`);
                c++;
              }
              const ws = fs.createWriteStream(outPath);
              rs.pipe(ws);
              ws.on('close', () => {
                nestedZipPaths.push(outPath);
                zipfile.readEntry();
              });
              ws.on('error', () => zipfile.readEntry());
            });
            return;
          }

          // Only extract DICOM files (.dcm/.dicom or no extension)
          const isDicom = ext === '.dcm' || ext === '.dicom' || ext === '';
          if (!isDicom) {
            zipfile.readEntry();
            return;
          }

          ExtractionSessionManager.update(sessionId, {
            stage: 'Extracting DICOM files',
            message: `Processing ${base}...`,
          });

          zipfile.openReadStream(entry, (err, rs) => {
            if (err) { zipfile.readEntry(); return; }
            // Deduplicate filename
            let outPath = path.join(targetDir, base);
            let n = 1;
            while (fs.existsSync(outPath)) {
              const e = path.extname(base);
              const nameNoExt = path.basename(base, e);
              outPath = path.join(targetDir, `${nameNoExt}_${n}${e}`);
              n++;
            }
            const ws = fs.createWriteStream(outPath);
            rs.pipe(ws);
            ws.on('close', () => {
              counters.dicomFiles++;
              ExtractionSessionManager.update(sessionId, {
                message: `Extracted ${counters.dicomFiles} DICOM files...`
              });
              zipfile.readEntry();
            });
            ws.on('error', () => zipfile.readEntry());
          });
        });

        zipfile.on('end', async () => {
          // Recursively extract nested zips, then delete them
          for (const nz of nestedZipPaths) {
            try {
              await extractSingleZip(nz);
            } catch (e) {
              console.warn('⚠️ Failed to extract nested zip:', nz, e.message);
            } finally {
              try { fs.unlinkSync(nz); } catch { }
            }
          }
          resolve();
        });

        zipfile.on('error', (e) => reject(new Error(`ZIP extraction error: ${e.message}`)));
      });
    });
  }

  await extractSingleZip(zipPath);

  // Cleanup unwanted files in target
  try {
    const items = fs.readdirSync(targetDir);
    for (const item of items) {
      if (item === '__nested__') continue;
      if (item.startsWith('._') || item === '.DS_Store' || item === 'Thumbs.db' || item === 'desktop.ini' || item.startsWith('~$') || item.endsWith('.tmp') || item === '__MACOSX') {
        const p = path.join(targetDir, item);
        try {
          if (fs.statSync(p).isDirectory()) fs.rmSync(p, { recursive: true, force: true });
          else fs.unlinkSync(p);
        } catch { }
      }
    }
  } catch (cleanupError) {
    console.warn('⚠️ Failed to clean up unwanted files:', cleanupError);
  }

  // Remove nested dir if created
  try { fs.rmSync(path.join(targetDir, '__nested__'), { recursive: true, force: true }); } catch { }


  // Process DICOM studies and save to DB
  console.log(`🔄 Starting DICOM study processing for folder: ${finalFolderName}`);
  try {
    const processingResult = await processDicomStudies(finalFolderName, sessionId, uploadedBy);
    ExtractionSessionManager.setComplete(sessionId, {
      dicomFilesExtracted: counters.dicomFiles,
      totalFilesInZip: counters.entriesSeen,
      studiesProcessed: processingResult.studiesProcessed,
      studiesSkipped: processingResult.studiesSkipped
    });
    ExtractionSessionManager.update(sessionId, {
      stage: 'Completed',
      message: `Successfully extracted ${counters.dicomFiles} DICOM files and processed ${processingResult.studiesProcessed} studies to folder: ${finalFolderName}`,
      finalFolderName
    });
    return {
      dicomFilesExtracted: counters.dicomFiles,
      totalFilesInZip: counters.entriesSeen,
      finalFolderName,
      studiesProcessed: processingResult.studiesProcessed,
      studiesSkipped: processingResult.studiesSkipped
    };
  } catch (processingError) {
    console.error('❌ DICOM processing failed:', processingError);
    ExtractionSessionManager.setComplete(sessionId, {
      dicomFilesExtracted: counters.dicomFiles,
      totalFilesInZip: counters.entriesSeen,
      processingError: processingError.message
    });
    ExtractionSessionManager.update(sessionId, {
      stage: 'Completed with warnings',
      message: `Extracted ${counters.dicomFiles} DICOM files but failed to process studies: ${processingError.message}`,
      finalFolderName
    });
    return {
      dicomFilesExtracted: counters.dicomFiles,
      totalFilesInZip: counters.entriesSeen,
      finalFolderName,
      processingError: processingError.message
    };
  }
}



/**
 * Clean up directory recursively
 */
async function cleanupDirectory(directory) {
  if (!fs.existsSync(directory)) return;

  const items = fs.readdirSync(directory);

  for (const item of items) {
    const itemPath = path.join(directory, item);
    const stat = fs.statSync(itemPath);

    if (stat.isDirectory()) {
      await cleanupDirectory(itemPath);
      fs.rmdirSync(itemPath);
    } else {
      fs.unlinkSync(itemPath);
    }
  }
}

/**
 * Handle ZIP upload finalization
 */
async function handleFinalizeZipUpload(req, res) {
  console.log('Finalize ZIP upload called with method:', req.method);
  console.log('Request body:', req.body);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { sessionId, patientId, filename, fileHash, totalChunks } = req.body;

    if (!sessionId || !patientId || !filename || !fileHash || !totalChunks) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Use patientId as folderName (which now contains the full zip name without extension)
    const folderName = patientId;

    // Get upload session
    console.log('Looking for upload session:', sessionId);
    const uploadSession = UploadSessionManager.get(sessionId);
    console.log('Upload session found:', uploadSession ? 'YES' : 'NO');
    if (!uploadSession) {
      return res.status(404).json({ error: 'Upload session not found' });
    }

    // Verify session data matches
    if (
      uploadSession.patientId !== patientId ||
      uploadSession.filename !== filename ||
      uploadSession.fileHash !== fileHash ||
      uploadSession.totalChunks !== totalChunks
    ) {
      return res.status(400).json({ error: 'Session data mismatch' });
    }

    // Verify all chunks are uploaded
    if (!UploadSessionManager.isComplete(sessionId)) {
      return res.status(400).json({ error: 'Not all chunks have been uploaded' });
    }

    // Initialize extraction session
    ExtractionSessionManager.create(sessionId, {
      folderName,
      patientId,
      stage: 'Assembling ZIP file',
      message: 'Combining uploaded chunks...'
    });

    // Determine uploader name from authenticated admin
    const uploadedBy = (req.admin?.email || req.admin?.name || 'unknown');

    // Start extraction process asynchronously
    setImmediate(async () => {
      try {
        // Assemble ZIP file
        const zipPath = await assembleZipFile(sessionId, uploadSession);

        // Extract and process
        const result = await extractZipFile(zipPath, folderName, sessionId, uploadedBy);

        // Clean up temporary ZIP file
        try {
          fs.unlinkSync(zipPath);
          console.log('🗑️ Temporary ZIP file cleaned up');
        } catch (zipCleanupError) {
          console.warn('⚠️ Failed to clean up temporary ZIP file:', zipCleanupError);
        }

        // Clean up session directory
        const sessionDir = path.join(TEMP_DIR, sessionId);
        setTimeout(() => {
          cleanupDirectory(sessionDir);
        }, 60000); // Clean up after 1 minute

      } catch (error) {
        console.error('ZIP extraction error:', error);
        ExtractionSessionManager.setError(sessionId, error.message);
      }
    });

    res.status(200).json({
      success: true,
      message: 'ZIP upload finalized, extraction started',
      sessionId,
      extractionStarted: true
    });

  } catch (error) {
    console.error('Finalize ZIP upload error:', error);
    res.status(500).json({ error: 'Failed to finalize upload: ' + error.message });
  }
}

export default requireAdminAuth(handleFinalizeZipUpload);
