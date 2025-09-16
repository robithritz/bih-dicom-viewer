import fs from 'fs';
import path from 'path';
import yauzl from 'yauzl';
import { PrismaClient } from '@prisma/client';
import { requireAdminAuth } from '../../../lib/admin-auth-middleware';
import { getDicomFiles, organizeDicomStudies } from '../../../lib/dicom';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '100mb'
    }
  }
};

const DICOM_DIR = path.join(process.cwd(), 'DICOM');
const TEMP_DIR = path.join(process.cwd(), 'temp', 'base64-upload');

if (!fs.existsSync(DICOM_DIR)) fs.mkdirSync(DICOM_DIR, { recursive: true });
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

async function processDicomStudies(folderName, uploadedBy) {
  let prismaClient = null;
  try {
    prismaClient = new PrismaClient();

    const files = getDicomFiles(folderName);
    if (files.length === 0) {
      console.warn(`No DICOM files found in ${folderName}`);
      return { studiesProcessed: 0, studiesSkipped: 0 };
    }

    const studies = organizeDicomStudies(files);
    const studyEntries = Object.entries(studies);

    const uploadedPatientId = folderName.split('_')[0];

    let studiesProcessed = 0;
    let studiesSkipped = 0;

    for (const [studyInstanceUID, study] of studyEntries) {
      try {
        const totalFiles = study.files ? study.files.length : 0;
        const totalSeries = study.series ? Object.keys(study.series).length : 0;

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

        const existingStudy = await prismaClient.dicomStudy.findUnique({
          where: { studyInstanceUID }
        });

        if (existingStudy) {
          await prismaClient.dicomStudy.update({
            where: { studyInstanceUID },
            data: { ...studyData, updatedAt: new Date() }
          });
        } else {
          await prismaClient.dicomStudy.create({
            data: { ...studyData, uploadedBy: uploadedBy || null }
          });
        }

        studiesProcessed++;
      } catch (err) {
        console.error('Failed to persist study:', err);
        studiesSkipped++;
      }
    }

    return { studiesProcessed, studiesSkipped };
  } finally {
    if (prismaClient) await prismaClient.$disconnect();
  }
}

function extractZipFile(zipPath, targetDir) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(new Error(`Failed to open ZIP file: ${err.message}`));

      let totalEntries = 0;
      let dicomFilesExtracted = 0;

      zipfile.on('entry', () => {
        totalEntries++;
        zipfile.readEntry();
      });

      zipfile.on('end', () => {
        if (totalEntries === 0) return reject(new Error('ZIP file is empty'));

        yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile2) => {
          if (err) return reject(new Error(`Failed to reopen ZIP file: ${err.message}`));

          zipfile2.on('entry', (entry) => {
            if (/\/$/.test(entry.fileName)) {
              zipfile2.readEntry();
              return;
            }

            if (entry.fileName.includes('__MACOSX') || entry.fileName.startsWith('._')) {
              zipfile2.readEntry();
              return;
            }

            if (!entry.fileName.toLowerCase().endsWith('.dcm')) {
              zipfile2.readEntry();
              return;
            }

            zipfile2.openReadStream(entry, (err, readStream) => {
              if (err) {
                console.error('Failed to read', entry.fileName, err);
                zipfile2.readEntry();
                return;
              }

              const fileName = path.basename(entry.fileName);
              const outputPath = path.join(targetDir, fileName);
              const writeStream = fs.createWriteStream(outputPath);

              readStream.pipe(writeStream);
              writeStream.on('close', () => {
                dicomFilesExtracted++;
                zipfile2.readEntry();
              });
              writeStream.on('error', () => zipfile2.readEntry());
            });
          });

          zipfile2.on('end', () => {
            // Clean up macOS ._ files
            try {
              const files = fs.readdirSync(targetDir);
              for (const f of files) if (f.startsWith('._')) fs.unlinkSync(path.join(targetDir, f));
            } catch { }

            resolve({ dicomFilesExtracted, totalFilesInZip: totalEntries });
          });

          zipfile2.on('error', (e) => reject(new Error(`ZIP extraction error: ${e.message}`)));
          zipfile2.readEntry();
        });
      });

      zipfile.readEntry();
    });
  });
}

async function handleUploadZipBase64(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { folderName, zipBase64, fileName, sizeBytes } = req.body || {};

    if (!folderName || !zipBase64) {
      return res.status(400).json({ error: 'Missing folderName or zipBase64' });
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(folderName)) {
      return res.status(400).json({ error: 'Invalid folder name' });
    }

    const tempZipPath = path.join(TEMP_DIR, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.zip`);

    // Decode and write ZIP file
    const zipBuffer = Buffer.from(zipBase64, 'base64');
    fs.writeFileSync(tempZipPath, zipBuffer);

    // Prepare target directory (handle duplicates with timestamp suffix)
    let finalFolderName = folderName;
    let targetDir = path.join(DICOM_DIR, finalFolderName);
    if (fs.existsSync(targetDir)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      finalFolderName = `${folderName}-${timestamp}`;
      targetDir = path.join(DICOM_DIR, finalFolderName);
    }

    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    // Extract
    const extractionResult = await extractZipFile(tempZipPath, targetDir);

    // Clean up temp zip
    try { fs.unlinkSync(tempZipPath); } catch { }

    // Process studies
    let studyProcessingResult = { studiesProcessed: 0, studiesSkipped: 0 };
    try {
      const uploadedBy = (req.user?.name || req.user?.email || 'unknown');
      studyProcessingResult = await processDicomStudies(finalFolderName, uploadedBy);
    } catch (e) {
      console.error('Study processing failed:', e);
    }

    return res.status(200).json({
      success: true,
      message: 'ZIP file uploaded (base64) and extracted successfully',
      dicomFilesExtracted: extractionResult.dicomFilesExtracted,
      totalFilesInZip: extractionResult.totalFilesInZip,
      finalFolderName,
      uploadMethod: 'single-base64',
      studiesProcessed: studyProcessingResult.studiesProcessed,
      studiesSkipped: studyProcessingResult.studiesSkipped,
      originalFileName: fileName,
      sizeBytes
    });
  } catch (err) {
    console.error('Base64 upload error:', err);
    return res.status(500).json({ error: 'Failed to process base64 ZIP upload', details: err.message });
  }
}

export default requireAdminAuth(handleUploadZipBase64);

