import { getDicomFiles, getDicomFilesByPatientId, organizeDicomStudies } from '../../../lib/dicom';
import { requireAdminAuth } from '../../../lib/admin-auth-middleware';

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { patient } = req.query;

    console.log('Admin loading studies, patient filter:', patient);

    // Admin can access all studies or filter by specific patient/folder
    let files;
    if (patient) {
      // Try exact folder match first, then patient ID search
      files = getDicomFiles(patient);
      if (files.length === 0) {
        // If no exact folder match, try searching by patient ID across all folders
        files = getDicomFilesByPatientId(patient);
      }
    } else {
      // Get all files from all folders
      files = getDicomFiles(null);
    }

    const studies = organizeDicomStudies(files);

    res.status(200).json({
      studies,
      patientFilter: patient || null,
      message: `Loaded ${files.length} files${patient ? ` for patient ${patient}` : ' (all patients)'}`
    });
  } catch (error) {
    console.error('Error reading DICOM directory:', error);
    res.status(500).json({ error: 'Error loading DICOM files' });
  }
}

export default requireAdminAuth(handler);
