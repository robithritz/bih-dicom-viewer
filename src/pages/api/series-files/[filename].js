import { getSeriesFiles } from '../../../lib/dicom';

export default function handler(req, res) {
  const { filename } = req.query;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const seriesData = getSeriesFiles(filename);
    res.status(200).json(seriesData);
  } catch (error) {
    console.error('Error getting series files:', error);
    if (error.message === 'File not found') {
      return res.status(404).json({ error: 'File not found' });
    }
    res.status(500).json({ error: 'Error getting series files' });
  }
}
