import { getDicomFilesByPatientId, parseDicomFile } from '../../../lib/dicom';
import { requireAuth, validatePatientFileAccess } from '../../../lib/auth-middleware';

async function handler(req, res) {
  const { filename } = req.query;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Validate patient access to the requested file
    const validation = validatePatientFileAccess(req, filename);

    if (!validation.isValid) {
      return res.status(403).json({ error: validation.error });
    }

    console.log('Getting study files for:', validation.patientFilePath);

    // Parse the current file to get its study ID
    const currentFileDataSet = parseDicomFile(validation.patientFilePath);
    const currentStudyUID = currentFileDataSet.string('x0020000d'); // Study Instance UID

    if (!currentStudyUID) {
      return res.status(400).json({ error: 'Could not determine study ID from current file' });
    }

    console.log('Current file study UID:', currentStudyUID);

    // Get all files for this patient
    const patientFiles = getDicomFilesByPatientId(validation.patientId);
    
    // Filter files to only include those from the same study
    const studyFiles = [];
    
    for (const file of patientFiles) {
      try {
        const fileDataSet = parseDicomFile(file);
        const fileStudyUID = fileDataSet.string('x0020000d');
        
        if (fileStudyUID === currentStudyUID) {
          // Get additional metadata for sorting
          const seriesNumber = parseInt(fileDataSet.string('x00200011') || '0');
          const instanceNumber = parseInt(fileDataSet.string('x00200013') || '0');
          
          studyFiles.push({
            name: file,
            studyUID: fileStudyUID,
            seriesNumber: seriesNumber,
            instanceNumber: instanceNumber
          });
        }
      } catch (parseError) {
        console.warn(`Could not parse file ${file}:`, parseError.message);
        // Skip files that can't be parsed
      }
    }

    // Sort files by series number, then by instance number
    studyFiles.sort((a, b) => {
      if (a.seriesNumber !== b.seriesNumber) {
        return a.seriesNumber - b.seriesNumber;
      }
      return a.instanceNumber - b.instanceNumber;
    });

    console.log(`Found ${studyFiles.length} files in study ${currentStudyUID}`);

    res.status(200).json({
      files: studyFiles,
      studyUID: currentStudyUID,
      currentFile: validation.patientFilePath,
      totalFiles: studyFiles.length
    });
  } catch (error) {
    console.error('Error getting study files:', error);
    res.status(500).json({ error: 'Error loading study files' });
  }
}

export default requireAuth(handler);
