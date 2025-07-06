import { getDicomFiles, DICOM_DIR } from '../../../lib/dicom';
import path from 'path';
import { requireAdminAuth } from '../../../lib/admin-auth-middleware';

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Use patient ID from authenticated session
    const patientId = req.query.patient;
    console.log(patientId)

    console.log('Loading files for authenticated patient:', patientId);

    const files = getDicomFiles(patientId).map(file => ({
      name: file,
      path: path.join(DICOM_DIR, file),
      patientId: patientId
    }));

    console.log(`Found ${files.length} DICOM files for patient ${patientId}`);
    res.status(200).json(files);
  } catch (error) {
    console.error('Error reading DICOM directory:', error);
    res.status(500).json({ error: 'Error reading DICOM directory' });
  }
}

export default requireAdminAuth(handler);
