import fs from 'fs';
import path from 'path';
import { DICOM_DIR } from '../../../../lib/dicom';
import { requireAdminAuth } from '../../../../lib/auth-middleware';

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
    console.log('Admin serving DICOM file:', filename);

    // Parse the filename parameter which might be in format "patientId/filename" or just "filename"
    let patientId, actualFilename, filePath;
    
    if (filename.includes('/')) {
      // Format: "patientId/filename"
      [patientId, actualFilename] = filename.split('/');
      filePath = path.join(DICOM_DIR, patientId, actualFilename);
    } else {
      // Format: just "filename" - try to find it in any patient folder
      // This is a fallback for legacy URLs
      filePath = path.join(DICOM_DIR, filename);
    }

    console.log('Admin serving DICOM file from path:', filePath);

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
    console.log('Admin DICOM file size:', fileBuffer.length, 'bytes');
    res.send(fileBuffer);

  } catch (error) {
    console.error('Error serving admin DICOM file:', error);
    res.status(500).json({ error: 'Error serving DICOM file' });
  }
}

export default requireAdminAuth(handler);
