import { getDicomFiles, organizeDicomStudies } from '../../../lib/dicom';
import { requireAdminAuth } from '../../../lib/admin-auth-middleware';

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { patient } = req.query;

    console.log('Admin loading studies, patient filter:', patient);

    // Admin can access all studies or filter by specific patient
    const files = getDicomFiles(patient || null);
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
