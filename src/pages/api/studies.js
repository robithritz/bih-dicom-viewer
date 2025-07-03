import { getDicomFiles, organizeDicomStudies } from '../../lib/dicom';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const files = getDicomFiles();
    const studies = organizeDicomStudies(files);
    res.status(200).json({ studies });
  } catch (error) {
    console.error('Error reading DICOM directory:', error);
    res.status(500).json({ error: 'Error loading DICOM files' });
  }
}
