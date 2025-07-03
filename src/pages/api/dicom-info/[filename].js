import { parseDicomFile, extractDicomMetadata } from '../../../lib/dicom';
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

    // Use patient-specific file path
    const dataSet = parseDicomFile(validation.patientFilePath);
    const metadata = extractDicomMetadata(dataSet);

    res.status(200).json(metadata);
  } catch (error) {
    console.error('Error parsing DICOM file:', error);
    if (error.message === 'File not found') {
      return res.status(404).json({ error: 'File not found' });
    }
    res.status(500).json({ error: 'Error parsing DICOM file' });
  }
}

export default requireAuth(handler);
