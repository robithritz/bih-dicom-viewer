import { parseDicomFile } from '../../../lib/dicom';

export default function handler(req, res) {
  const { filename } = req.query;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const dataSet = parseDicomFile(filename);

    // Get comprehensive image information
    const rows = dataSet.uint16('x00280010');
    const columns = dataSet.uint16('x00280011');
    const pixelData = dataSet.elements.x7fe00010;
    const windowCenter = dataSet.string('x00281050');
    const windowWidth = dataSet.string('x00281051');
    const rescaleIntercept = dataSet.string('x00281052');
    const rescaleSlope = dataSet.string('x00281053');

    res.status(200).json({
      rows,
      columns,
      pixelDataLength: pixelData ? pixelData.length : 0,
      hasPixelData: !!pixelData,
      windowCenter: windowCenter || 'Not specified',
      windowWidth: windowWidth || 'Not specified',
      rescaleIntercept: rescaleIntercept || '0',
      rescaleSlope: rescaleSlope || '1',
      cornerstoneUrl: `/api/dicom-file/${filename}`,
      message: 'Enhanced DICOM data for Cornerstone.js rendering'
    });

  } catch (error) {
    console.error('Error extracting image data:', error);
    if (error.message === 'File not found') {
      return res.status(404).json({ error: 'File not found' });
    }
    res.status(500).json({ error: 'Error extracting image data' });
  }
}
