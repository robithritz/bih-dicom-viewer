import { parseDicomFile, extractDicomMetadata } from '../../../lib/dicom';

export default function handler(req, res) {
  const { filename } = req.query;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const dataSet = parseDicomFile(filename);
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
