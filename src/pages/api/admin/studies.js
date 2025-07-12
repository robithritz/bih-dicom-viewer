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

    // get patient detail from db using studies.firstFile substring before first '_'
    for (const study of Object.values(studies)) {
      console.log("STUDENT", study.firstFile);
      if (study.firstFile) {
        const patientId = study.firstFile.split('_')[0];
        const patient = await prisma.patient.findUnique({
          where: { urn: patientId }
        });
        console.log("PATIENT ", patient);
        studies[study.studyInstanceUID].uploadedPatientName = `${patient.firstName} ${patient.lastName}`;
        studies[study.studyInstanceUID].uploadedPatientId = patientId;
      }
    }

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
