import fs from 'fs';
import path from 'path';
import { DICOM_DIR } from '../../../lib/dicom';
import { requireAuth, validatePatientFileAccess } from '../../../lib/auth-middleware';

async function handler(req, res) {
  const { filename } = req.query;

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Validate patient access to the requested file
    const validation = validatePatientFileAccess(req, filename);

    if (!validation.isValid) {
      return res.status(403).json({ error: validation.error });
    }

    // Use patient-specific file path
    const filePath = path.join(DICOM_DIR, validation.patientFilePath);

    console.log('Serving DICOM file for patient:', req.patient.patientId, 'filename:', filename, 'from path:', filePath);

    if (!fs.existsSync(filePath)) {
      console.error('DICOM file not found:', filePath);
      return res.status(404).json({ error: 'File not found' });
    }

    // Set appropriate headers for DICOM files
    res.setHeader('Content-Type', 'application/dicom');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

    // Read and send the file buffer
    const fileBuffer = fs.readFileSync(filePath);
    console.log('DICOM file size:', fileBuffer.length, 'bytes');
    res.send(fileBuffer);

  } catch (error) {
    console.error('Error serving DICOM file:', error);
    res.status(500).json({ error: 'Error serving DICOM file' });
  }
}

export default requireAuth(handler);
