import { getDicomFiles, getDicomFilesByPatientId, parseDicomFile } from '../../../../lib/dicom';
import { requireAdminAuth } from '../../../../lib/admin-auth-middleware';

async function handler(req, res) {
  const { filename } = req.query;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Admin getting study files for:', filename);

    // Parse the filename parameter which might be in format "folderName/filename" or just "filename"
    let folderName, actualFilename, filePath;
    
    if (filename.includes('/')) {
      // Format: "folderName/filename"
      [folderName, actualFilename] = filename.split('/');
      filePath = filename;
    } else {
      // Format: just "filename" - try to find it in any folder
      filePath = filename;
      actualFilename = filename;
    }

    console.log('Parsed filename:', { folderName, actualFilename, filePath });

    // Parse the current file to get its study ID
    const currentFileDataSet = parseDicomFile(filePath);
    const currentStudyUID = currentFileDataSet.string('x0020000d'); // Study Instance UID

    if (!currentStudyUID) {
      return res.status(400).json({ error: 'Could not determine study ID from current file' });
    }

    console.log('Current file study UID:', currentStudyUID);

    // Get all files (admin can access all files)
    let allFiles;
    if (folderName) {
      // If we have a folder name, get files from that folder and also search by patient ID
      const folderPatientId = folderName.split('_')[0]; // Extract patient ID from folder name
      allFiles = getDicomFiles(folderName); // Files from specific folder
      
      // Also get files from other folders for the same patient
      const patientFiles = getDicomFilesByPatientId(folderPatientId);
      
      // Combine and deduplicate
      const allFilesSet = new Set([...allFiles, ...patientFiles]);
      allFiles = Array.from(allFilesSet);
    } else {
      // Get all files from all folders
      allFiles = getDicomFiles(null);
    }
    
    // Filter files to only include those from the same study
    const studyFiles = [];
    
    for (const file of allFiles) {
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
      currentFile: filePath,
      totalFiles: studyFiles.length
    });
  } catch (error) {
    console.error('Error getting study files:', error);
    res.status(500).json({ error: 'Error loading study files' });
  }
}

export default requireAdminAuth(handler);
