import { getDicomFiles, DICOM_DIR } from '../../lib/dicom';
import path from 'path';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const files = getDicomFiles().map(file => ({
      name: file,
      path: path.join(DICOM_DIR, file)
    }));

    console.log(`Found ${files.length} DICOM files`);
    res.status(200).json(files);
  } catch (error) {
    console.error('Error reading DICOM directory:', error);
    res.status(500).json({ error: 'Error reading DICOM directory' });
  }
}
