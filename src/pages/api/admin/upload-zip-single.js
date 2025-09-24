import formidable from 'formidable';
import fs from 'fs';
import path from 'path';
import yauzl from 'yauzl';
import { requireAdminAuth } from '../../../lib/admin-auth-middleware';
import { PrismaClient } from '@prisma/client';
import { getDicomFiles, organizeDicomStudies } from '../../../lib/dicom';

// Disable body parser for file uploads
export const config = {
  api: {
    bodyParser: false,
  },
};

const DICOM_DIR = path.join(process.cwd(), 'DICOM');
const TEMP_DIR = path.join(process.cwd(), 'temp', 'single-upload');

// Ensure directories exist
if (!fs.existsSync(DICOM_DIR)) {
  fs.mkdirSync(DICOM_DIR, { recursive: true });
}
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Process DICOM studies and save to database
 */
async function processDicomStudies(folderName, uploadedBy) {
  let prismaClient = null;

  try {
    console.log(`📊 Processing DICOM studies for folder: ${folderName}`);

    // Create a new Prisma client instance for this operation
    prismaClient = new PrismaClient();

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
          // Update existing study and set active = true
          createdStudy = await prismaClient.dicomStudy.update({
            where: { studyInstanceUID },
            data: {
              ...studyData,
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
    // Clean up Prisma client
    if (prismaClient) {
      await prismaClient.$disconnect();
    }
  }
}

/**
 * Handle single ZIP file upload (WAF-friendly)
 */
async function handleSingleZipUpload(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🚀 Starting single ZIP upload (WAF-friendly mode)');

    // Parse form data with larger file size limit
    const form = formidable({
      maxFileSize: 100 * 1024 * 1024, // 100MB max for single upload
      keepExtensions: true,
      uploadDir: TEMP_DIR
    });

    const [fields, files] = await form.parse(req);

    // Extract fields
    const folderName = fields.folderName?.[0];
    if (!folderName) {
      return res.status(400).json({ error: 'Missing folder name' });
    }

    // Get uploaded file
    const zipFileArray = files.zipFile;
    const zipFile = Array.isArray(zipFileArray) ? zipFileArray[0] : zipFileArray;

    if (!zipFile) {
      return res.status(400).json({ error: 'No ZIP file uploaded' });
    }

    const zipPath = zipFile.filepath || zipFile.path;
    console.log(`📦 Processing ZIP file: ${zipFile.originalFilename || zipFile.name} (${(zipFile.size / 1024 / 1024).toFixed(2)}MB)`);

    // Check if folder already exists and create unique name if needed
    let finalFolderName = folderName;
    let targetDir = path.join(DICOM_DIR, finalFolderName);

    if (fs.existsSync(targetDir)) {
      // Generate timestamp suffix
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      finalFolderName = `${folderName}-${timestamp}`;
      targetDir = path.join(DICOM_DIR, finalFolderName);

      console.log(`📁 Folder ${folderName} already exists, using ${finalFolderName} instead`);
    }

    // Create target directory
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
      console.log(`📁 Created directory: ${targetDir}`);
    }

    // Extract ZIP file
    const extractionResult = await extractZipFile(zipPath, targetDir);

    // Clean up temporary ZIP file
    try {
      fs.unlinkSync(zipPath);
      console.log('🗑️ Temporary ZIP file cleaned up');
    } catch (cleanupError) {
      console.warn('⚠️ Failed to clean up temporary ZIP file:', cleanupError);
    }

    // Process DICOM studies and save to database
    let studyProcessingResult = { studiesProcessed: 0, studiesSkipped: 0 };
    try {
      console.log(`📊 Starting DICOM study processing for folder: ${finalFolderName}`);
      const uploadedBy = (req.user?.name || req.user?.email || 'unknown');
      studyProcessingResult = await processDicomStudies(finalFolderName, uploadedBy);
      console.log(`✅ DICOM study processing completed: ${studyProcessingResult.studiesProcessed} processed, ${studyProcessingResult.studiesSkipped} skipped`);
    } catch (studyError) {
      console.error('❌ DICOM study processing failed:', studyError);
      // Continue with response even if study processing fails
    }

    console.log(`✅ Single upload completed: ${extractionResult.dicomFilesExtracted} DICOM files extracted to ${finalFolderName}`);

    res.status(200).json({
      success: true,
      message: 'ZIP file uploaded and extracted successfully',
      dicomFilesExtracted: extractionResult.dicomFilesExtracted,
      totalFilesInZip: extractionResult.totalFilesInZip,
      finalFolderName: finalFolderName,
      uploadMethod: 'single',
      studiesProcessed: studyProcessingResult.studiesProcessed,
      studiesSkipped: studyProcessingResult.studiesSkipped
    });

  } catch (error) {
    console.error('Single ZIP upload error:', error);
    res.status(500).json({
      error: 'Failed to process ZIP upload',
      details: error.message
    });
  }
}

/**
 * Extract ZIP (and nested ZIPs) into targetDir, flattening DICOM files
 */
async function extractZipFile(zipPath, targetDir) {
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
          if (/\/$/.test(entry.fileName)) { zipfile.readEntry(); return; }
          const base = path.basename(entry.fileName);
          const ext = path.extname(base).toLowerCase();

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
              ws.on('close', () => { nestedZipPaths.push(outPath); zipfile.readEntry(); });
              ws.on('error', () => zipfile.readEntry());
            });
            return;
          }

          const isDicom = ext === '.dcm' || ext === '.dicom' || ext === '';
          if (!isDicom) { zipfile.readEntry(); return; }

          zipfile.openReadStream(entry, (err, rs) => {
            if (err) { zipfile.readEntry(); return; }
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
            ws.on('close', () => { counters.dicomFiles++; zipfile.readEntry(); });
            ws.on('error', () => zipfile.readEntry());
          });
        });

        zipfile.on('end', async () => {
          for (const nz of nestedZipPaths) {
            try { await extractSingleZip(nz); } catch (e) { console.warn('Nested zip failed:', nz, e.message); }
            try { fs.unlinkSync(nz); } catch { }
          }
          resolve();
        });

        zipfile.on('error', (e) => reject(new Error(`ZIP extraction error: ${e.message}`)));
      });
    });
  }

  await extractSingleZip(zipPath);

  // Cleanup unwanted files
  try {
    const files = fs.readdirSync(targetDir);
    for (const f of files) {
      if (f === '__nested__') continue;
      if (f.startsWith('._') || f === '.DS_Store' || f === 'Thumbs.db' || f === 'desktop.ini' || f.startsWith('~$') || f.endsWith('.tmp') || f === '__MACOSX') {
        const p = path.join(targetDir, f);
        try {
          if (fs.statSync(p).isDirectory()) fs.rmSync(p, { recursive: true, force: true });
          else fs.unlinkSync(p);
        } catch { }
      }
    }
  } catch { }

  // Remove nested dir if created
  try { fs.rmSync(path.join(targetDir, '__nested__'), { recursive: true, force: true }); } catch { }


  return { dicomFilesExtracted: counters.dicomFiles, totalFilesInZip: counters.entriesSeen };
}

export default requireAdminAuth(handleSingleZipUpload);
