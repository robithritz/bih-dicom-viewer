import { getDicomFiles, getDicomFilesByPatientId, DICOM_DIR } from '../../../lib/dicom';
import path from 'path';
import { requireAdminAuth } from '../../../lib/admin-auth-middleware';

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Use patient ID or folder name from query parameter
    const identifier = req.query.patient;
    console.log('Loading files for identifier:', identifier);

    // Try both approaches: exact folder match and patient ID search
    let files = getDicomFiles(identifier); // Try exact folder name first

    if (files.length === 0) {
      // If no exact folder match, try searching by patient ID across all folders
      files = getDicomFilesByPatientId(identifier);
    }

    const fileList = files.map(file => ({
      name: file,
      path: path.join(DICOM_DIR, file),
      patientId: identifier
    }));

    console.log(`Found ${fileList.length} DICOM files for identifier ${identifier}`);
    res.status(200).json(fileList);
  } catch (error) {
    console.error('Error reading DICOM directory:', error);
    res.status(500).json({ error: 'Error reading DICOM directory' });
  }
}

export default requireAdminAuth(handler);
