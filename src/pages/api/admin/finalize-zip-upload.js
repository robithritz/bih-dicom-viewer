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
async function processDicomStudies(folderName, sessionId) {
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

        // Check if study already exists
        const existingStudy = await prismaClient.dicomStudy.findUnique({
          where: { studyInstanceUID }
        });

        if (existingStudy) {
          console.log(`⏭️ Study already exists: ${studyInstanceUID}`);
          studiesSkipped++;
          continue;
        }

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

        console.log(`💾 Inserting study data:`, studyData);

        // Insert study into database
        const createdStudy = await prismaClient.dicomStudy.create({
          data: studyData
        });

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
 * Extract ZIP file and move DICOM files
 */
async function extractZipFile(zipPath, folderName, sessionId) {
  // Check if folder already exists and create unique name if needed
  let finalFolderName = folderName;
  let targetDir = path.join(DICOM_DIR, finalFolderName);

  if (fs.existsSync(targetDir)) {
    // Generate timestamp suffix
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5); // Format: YYYY-MM-DDTHH-MM-SS
    finalFolderName = `${folderName}-${timestamp}`;
    targetDir = path.join(DICOM_DIR, finalFolderName);

    console.log(`📁 Folder ${folderName} already exists, using ${finalFolderName} instead`);
  }

  // Ensure target directory exists
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    console.log(`📁 Created directory: ${targetDir}`);
  }

  return new Promise((resolve, reject) => {
    // Update extraction status
    ExtractionSessionManager.update(sessionId, {
      stage: 'Extracting ZIP file',
      message: `Opening ZIP archive... Target: ${finalFolderName}`
    });

    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) {
        return reject(new Error(`Failed to open ZIP file: ${err.message}`));
      }

      let totalEntries = 0;
      let processedEntries = 0;
      let dicomFilesExtracted = 0;
      const extractedFiles = [];

      // Count total entries first
      zipfile.on('entry', (entry) => {
        totalEntries++;
      });

      // Reset to process entries
      zipfile.readEntry();

      zipfile.on('entry', (entry) => {
        processedEntries++;

        // Skip directories
        if (/\/$/.test(entry.fileName)) {
          zipfile.readEntry();
          return;
        }

        // Check if file is DICOM
        const fileName = path.basename(entry.fileName);
        const ext = path.extname(fileName).toLowerCase();
        const isDicom = ext === '.dcm' || ext === '.dicom' || ext === '';

        if (!isDicom) {
          // Skip non-DICOM files
          zipfile.readEntry();
          return;
        }

        // Update progress
        ExtractionSessionManager.update(sessionId, {
          stage: 'Extracting DICOM files',
          message: `Processing ${fileName}...`,
          filesProcessed: processedEntries,
          totalFilesInZip: totalEntries
        });

        // Extract DICOM file
        zipfile.openReadStream(entry, (err, readStream) => {
          if (err) {
            console.error(`Error extracting ${entry.fileName}:`, err);
            zipfile.readEntry();
            return;
          }

          // Handle duplicate filenames
          let targetPath = path.join(targetDir, fileName);
          let counter = 1;
          while (fs.existsSync(targetPath)) {
            const ext = path.extname(fileName);
            const nameWithoutExt = path.basename(fileName, ext);
            targetPath = path.join(targetDir, `${nameWithoutExt}_${counter}${ext}`);
            counter++;
          }

          // Write file to target directory
          const writeStream = fs.createWriteStream(targetPath);
          readStream.pipe(writeStream);

          writeStream.on('close', () => {
            dicomFilesExtracted++;
            extractedFiles.push(targetPath);

            // Update progress
            ExtractionSessionManager.update(sessionId, {
              filesProcessed: processedEntries,
              message: `Extracted ${dicomFilesExtracted} DICOM files...`
            });

            // Continue to next entry
            zipfile.readEntry();
          });

          writeStream.on('error', (err) => {
            console.error(`Error writing ${targetPath}:`, err);
            zipfile.readEntry();
          });
        });
      });

      zipfile.on('end', () => {
        // Clean up unwanted files from target directory
        try {
          const targetFiles = fs.readdirSync(targetDir);
          const unwantedFiles = targetFiles.filter(file => {
            return (
              file.startsWith('._') ||           // macOS resource fork files
              file === '.DS_Store' ||            // macOS folder metadata
              file === 'Thumbs.db' ||            // Windows thumbnail cache
              file === 'desktop.ini' ||          // Windows folder settings
              file.startsWith('~$') ||           // Office temporary files
              file.endsWith('.tmp') ||           // Temporary files
              file === '__MACOSX'                // macOS metadata folder
            );
          });

          for (const unwantedFile of unwantedFiles) {
            const unwantedPath = path.join(targetDir, unwantedFile);

            // Handle both files and directories
            if (fs.statSync(unwantedPath).isDirectory()) {
              // Remove directory recursively
              fs.rmSync(unwantedPath, { recursive: true, force: true });
              console.log(`🗑️ Removed unwanted directory: ${unwantedFile}`);
            } else {
              // Remove file
              fs.unlinkSync(unwantedPath);
              console.log(`🗑️ Removed unwanted file: ${unwantedFile}`);
            }
          }

          if (unwantedFiles.length > 0) {
            console.log(`✅ Cleaned up ${unwantedFiles.length} unwanted files/folders from ${folderName}`);
            ExtractionSessionManager.update(sessionId, {
              stage: 'Cleaning up',
              message: `Removed ${unwantedFiles.length} unwanted files`
            });
          }
        } catch (cleanupError) {
          console.warn('⚠️ Failed to clean up unwanted files:', cleanupError);
        }

        // Process DICOM studies and save to database
        console.log(`🔄 Starting DICOM study processing for folder: ${finalFolderName}`);

        processDicomStudies(finalFolderName, sessionId)
          .then((processingResult) => {
            console.log(`✅ DICOM processing completed:`, processingResult);

            // Update final status with database processing results
            ExtractionSessionManager.setComplete(sessionId, {
              dicomFilesExtracted,
              totalFilesInZip: totalEntries,
              studiesProcessed: processingResult.studiesProcessed,
              studiesSkipped: processingResult.studiesSkipped
            });
            ExtractionSessionManager.update(sessionId, {
              stage: 'Completed',
              message: `Successfully extracted ${dicomFilesExtracted} DICOM files and processed ${processingResult.studiesProcessed} studies to folder: ${finalFolderName}`,
              finalFolderName: finalFolderName
            });

            resolve({
              dicomFilesExtracted,
              totalFilesInZip: totalEntries,
              finalFolderName: finalFolderName,
              studiesProcessed: processingResult.studiesProcessed,
              studiesSkipped: processingResult.studiesSkipped
            });
          })
          .catch((processingError) => {
            console.error('❌ DICOM processing failed:', processingError);
            console.error('❌ Full error stack:', processingError.stack);

            // Still mark as complete but with processing error
            ExtractionSessionManager.setComplete(sessionId, {
              dicomFilesExtracted,
              totalFilesInZip: totalEntries,
              processingError: processingError.message
            });
            ExtractionSessionManager.update(sessionId, {
              stage: 'Completed with warnings',
              message: `Extracted ${dicomFilesExtracted} DICOM files but failed to process studies: ${processingError.message}`,
              finalFolderName: finalFolderName
            });

            resolve({
              dicomFilesExtracted,
              totalFilesInZip: totalEntries,
              finalFolderName: finalFolderName,
              processingError: processingError.message
            });
          });
      });

      zipfile.on('error', (err) => {
        reject(new Error(`ZIP extraction error: ${err.message}`));
      });
    });
  });
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

    // Start extraction process asynchronously
    setImmediate(async () => {
      try {
        // Assemble ZIP file
        const zipPath = await assembleZipFile(sessionId, uploadSession);

        // Extract and process
        const result = await extractZipFile(zipPath, folderName, sessionId);

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
