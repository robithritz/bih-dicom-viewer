import { parseDicomFile, extractDicomMetadata } from '../../../../lib/dicom';
import { requireAdminAuth } from '../../../../lib/auth-middleware';

async function handler(req, res) {
  const { filename } = req.query;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Admin loading DICOM info for file:', filename);

    // Parse the filename parameter which might be in format "patientId/filename" or just "filename"
    let patientId, actualFilename;

    if (filename.includes('/')) {
      // Format: "patientId/filename"
      [patientId, actualFilename] = filename.split('/');
    } else {
      // Format: just "filename" - need to find which patient folder it's in
      // For now, we'll try to parse it directly and let the error handling catch it
      actualFilename = filename;
      patientId = null;
    }

    console.log('Parsed filename:', { patientId, actualFilename });

    // Use patient-specific file path if patientId is provided
    const dataSet = patientId
      ? parseDicomFile(`${patientId}/${actualFilename}`)
      : parseDicomFile(actualFilename);

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

export default requireAdminAuth(handler);
