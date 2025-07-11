import { getDicomFilesByPatientId, organizeDicomStudies } from '../../lib/dicom';
import { requireAuth } from '../../lib/auth-middleware';

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Use patient ID from authenticated session instead of query parameter
    const patientId = req.patient.urn;

    console.log('Loading studies for authenticated patient:', patientId);

    const files = getDicomFilesByPatientId(patientId);
    console.log("FILES for patient", patientId, ":", files);
    const studies = organizeDicomStudies(files);

    res.status(200).json({
      studies,
      patientId: patientId,
      message: `Loaded ${files.length} files for patient ${patientId}`
    });
  } catch (error) {
    console.error('Error reading DICOM directory:', error);
    res.status(500).json({ error: 'Error loading DICOM files' });
  }
}

export default requireAuth(handler);
