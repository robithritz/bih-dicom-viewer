import prisma from '../../../../../lib/prisma';
import { getDicomFilesByPatientId, parseDicomFile } from '../../../../../lib/dicom';

export default async function handler(req, res) {
  const { token, filename } = req.query;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const study = await prisma.dicomStudy.findFirst({
      where: {
        publicToken: token,
        isPublic: true,
        publicExpiresAt: { gt: new Date() },
      }
    });

    if (!study) return res.status(404).json({ error: 'Not found or expired' });

    const sharedFolder = (study.firstFile || '').split('/')[0];
    const reqFolder = (filename || '').split('/')[0];
    if (!sharedFolder || sharedFolder !== reqFolder) {
      return res.status(403).json({ error: 'File not part of shared study' });
    }

    // Parse the current file to get its study ID
    const currentFileDataSet = parseDicomFile(filename);
    const currentStudyUID = currentFileDataSet.string('x0020000d'); // Study Instance UID
    if (!currentStudyUID) {
      return res.status(400).json({ error: 'Could not determine study ID from current file' });
    }

    // Get all files for this patient (by URN from DB)
    const patientFiles = getDicomFilesByPatientId(study.uploadedPatientId);

    // Filter files to only include those from the same study
    const studyFiles = [];
    for (const file of patientFiles) {
      try {
        const fileDataSet = parseDicomFile(file);
        const fileStudyUID = fileDataSet.string('x0020000d');
        if (fileStudyUID === currentStudyUID) {
          const seriesNumber = parseInt(fileDataSet.string('x00200011') || '0');
          const instanceNumber = parseInt(fileDataSet.string('x00200013') || '0');
          studyFiles.push({ name: file, studyUID: fileStudyUID, seriesNumber, instanceNumber });
        }
      } catch (e) {
        // skip unparseable
      }
    }

    // Sort files by series number, then by instance number
    studyFiles.sort((a, b) => {
      if (a.seriesNumber !== b.seriesNumber) return a.seriesNumber - b.seriesNumber;
      return a.instanceNumber - b.instanceNumber;
    });

    // Group files by series
    const seriesByNumber = {};
    studyFiles.forEach((file) => {
      let seriesNum = file.seriesNumber || 1;
      if (!seriesByNumber[seriesNum]) {
        seriesByNumber[seriesNum] = { seriesNumber: seriesNum, files: [], seriesDescription: null, seriesInstanceUID: null };
      }
      seriesByNumber[seriesNum].files.push(file);
    });

    // Derive description/UID from first file in each series
    for (const s of Object.values(seriesByNumber)) {
      try {
        const ds = parseDicomFile(s.files[0].name);
        s.seriesDescription = ds.string('x0008103e') || ds.string('x00081030') || `Series ${s.seriesNumber}`;
        s.seriesInstanceUID = ds.string('x0020000e') || null;
      } catch (e) {
        s.seriesDescription = `Series ${s.seriesNumber}`;
      }
    }

    const seriesArray = Object.values(seriesByNumber).sort((a, b) => a.seriesNumber - b.seriesNumber);
    const currentFile = studyFiles.find(f => f.name === filename);
    const currentSeriesNumber = currentFile?.seriesNumber || 1;
    const currentSeriesIndex = Math.max(0, seriesArray.findIndex(s => s.seriesNumber === currentSeriesNumber));

    res.status(200).json({
      files: studyFiles,
      series: seriesArray,
      studyUID: currentStudyUID,
      currentFile: filename,
      currentSeriesIndex,
      totalFiles: studyFiles.length,
      totalSeries: seriesArray.length,
    });
  } catch (err) {
    console.error('Public study-files error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

