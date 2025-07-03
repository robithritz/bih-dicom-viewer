import { getDicomFiles, DICOM_DIR } from '../../lib/dicom';
import { requireAuth } from '../../lib/auth-middleware';
import path from 'path';

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Use patient ID from authenticated session
    const patientId = req.patient.patientId;

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

export default requireAuth(handler);
