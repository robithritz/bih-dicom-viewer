import fs from 'fs';
import path from 'path';
import dicomParser from 'dicom-parser';
import { requireAdminAuth } from '../../../../lib/admin-auth-middleware';

async function handler(req, res) {
  const { filename } = req.query;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Admin generating thumbnail for:', filename);

    const dicomDir = path.join(process.cwd(), 'DICOM');
    const filePath = path.join(dicomDir, filename);

    if (!fs.existsSync(filePath)) {
      console.error('File not found:', filePath);
      return res.status(404).json({ error: 'File not found' });
    }

    // Read DICOM file
    const dicomBuffer = fs.readFileSync(filePath);
    const dataSet = dicomParser.parseDicom(dicomBuffer);

    // Extract pixel data
    const pixelDataElement = dataSet.elements.x7fe00010;
    if (!pixelDataElement) {
      return res.status(400).json({ error: 'No pixel data found' });
    }

    // Get image dimensions
    const rows = dataSet.uint16('x00280010') || 512;
    const cols = dataSet.uint16('x00280011') || 512;
    const samplesPerPixel = dataSet.uint16('x00280002') || 1;
    const bitsAllocated = dataSet.uint16('x00280100') || 16;
    const pixelRepresentation = dataSet.uint16('x00280103') || 0;

    // Extract pixel data
    let pixelData;
    if (bitsAllocated === 16) {
      if (pixelRepresentation === 0) {
        pixelData = new Uint16Array(dicomBuffer, pixelDataElement.dataOffset, pixelDataElement.length / 2);
      } else {
        pixelData = new Int16Array(dicomBuffer, pixelDataElement.dataOffset, pixelDataElement.length / 2);
      }
    } else {
      pixelData = new Uint8Array(dicomBuffer, pixelDataElement.dataOffset, pixelDataElement.length);
    }

    // Create thumbnail (downscale to 150x150)
    const thumbnailSize = 150;
    const scaleX = cols / thumbnailSize;
    const scaleY = rows / thumbnailSize;

    // Create canvas-like pixel array for thumbnail
    const thumbnailData = new Uint8ClampedArray(thumbnailSize * thumbnailSize * 4); // RGBA

    // Find min/max for windowing
    let min = pixelData[0];
    let max = pixelData[0];
    for (let i = 0; i < pixelData.length; i++) {
      if (pixelData[i] < min) min = pixelData[i];
      if (pixelData[i] > max) max = pixelData[i];
    }

    const range = max - min;

    // Generate thumbnail pixels
    for (let y = 0; y < thumbnailSize; y++) {
      for (let x = 0; x < thumbnailSize; x++) {
        const sourceX = Math.floor(x * scaleX);
        const sourceY = Math.floor(y * scaleY);
        const sourceIndex = sourceY * cols + sourceX;

        if (sourceIndex < pixelData.length) {
          // Normalize pixel value to 0-255
          const normalizedValue = range > 0 ? ((pixelData[sourceIndex] - min) / range) * 255 : 0;
          const pixelValue = Math.max(0, Math.min(255, normalizedValue));

          const thumbnailIndex = (y * thumbnailSize + x) * 4;
          thumbnailData[thumbnailIndex] = pixelValue;     // R
          thumbnailData[thumbnailIndex + 1] = pixelValue; // G
          thumbnailData[thumbnailIndex + 2] = pixelValue; // B
          thumbnailData[thumbnailIndex + 3] = 255;        // A
        }
      }
    }

    // Convert to base64 PNG-like format
    // For simplicity, we'll return raw image data that can be processed by canvas
    const imageData = {
      width: thumbnailSize,
      height: thumbnailSize,
      data: Array.from(thumbnailData)
    };

    console.log('Successfully generated thumbnail for:', filename);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    res.status(200).json(imageData);

  } catch (error) {
    console.error('Error generating admin thumbnail:', error);
    res.status(500).json({ error: 'Failed to generate thumbnail' });
  }
}

export default requireAdminAuth(handler);
