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
  const counters = { entriesSeen: 0, dicomFiles: 0 };

  const extractSingleZip = (zipFilePath) => new Promise((resolve, reject) => {
    const nestedDir = path.join(targetDir, '__nested__');
    if (!fs.existsSync(nestedDir)) fs.mkdirSync(nestedDir, { recursive: true });

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

  return (async () => {
    await extractSingleZip(zipPath);

    // Clean unwanted files
    try {
      const files = fs.readdirSync(targetDir);
      for (const f of files) {
        if (f === '__nested__') continue;
        if (f.startsWith('._') || f === '.DS_Store' || f === 'Thumbs.db' || f === 'desktop.ini' || f.startsWith('~$') || f.endsWith('.tmp') || f === '__MACOSX') {
          const p = path.join(targetDir, f);
          try { if (fs.statSync(p).isDirectory()) fs.rmSync(p, { recursive: true, force: true }); else fs.unlinkSync(p); } catch { }
        }
      }
    } catch { }

    // Remove nested dir if created
    try { fs.rmSync(path.join(targetDir, '__nested__'), { recursive: true, force: true }); } catch { }


    return { dicomFilesExtracted: counters.dicomFiles, totalFilesInZip: counters.entriesSeen };
  })();
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

