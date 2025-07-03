import fs from 'fs';
import path from 'path';
import dicomParser from 'dicom-parser';

export const DICOM_DIR = path.join(process.cwd(), 'DICOM');

export function getDicomFiles(patientId = null) {
  try {
    if (patientId) {
      // Look for files in patient-specific directory
      const patientDir = path.join(DICOM_DIR, patientId);
      if (fs.existsSync(patientDir)) {
        const files = fs.readdirSync(patientDir);
        return files
          .filter(file => file.toLowerCase().endsWith('.dcm') || file.toLowerCase().endsWith('.dicom'))
          .map(file => path.join(patientId, file)); // Include patient folder in path
      }
      return [];
    } else {
      // Get all DICOM files from all directories
      const allFiles = [];

      // Get files from root DICOM directory
      if (fs.existsSync(DICOM_DIR)) {
        const rootFiles = fs.readdirSync(DICOM_DIR);
        rootFiles.forEach(item => {
          const itemPath = path.join(DICOM_DIR, item);
          const stat = fs.statSync(itemPath);

          if (stat.isFile() && (item.toLowerCase().endsWith('.dcm') || item.toLowerCase().endsWith('.dicom'))) {
            allFiles.push(item);
          } else if (stat.isDirectory()) {
            // Check patient subdirectories
            try {
              const subFiles = fs.readdirSync(itemPath);
              subFiles.forEach(subFile => {
                if (subFile.toLowerCase().endsWith('.dcm') || subFile.toLowerCase().endsWith('.dicom')) {
                  allFiles.push(path.join(item, subFile));
                }
              });
            } catch (err) {
              console.warn(`Error reading subdirectory ${item}:`, err);
            }
          }
        });
      }

      return allFiles;
    }
  } catch (error) {
    console.error('Error reading DICOM directory:', error);
    return [];
  }
}

export function parseDicomFile(filename) {
  try {
    const filePath = path.join(DICOM_DIR, filename);
    if (!fs.existsSync(filePath)) {
      throw new Error('File not found');
    }

    const dicomFileAsBuffer = fs.readFileSync(filePath);
    const dataSet = dicomParser.parseDicom(dicomFileAsBuffer);

    return dataSet;
  } catch (error) {
    console.error(`Error parsing DICOM file ${filename}:`, error);
    throw error;
  }
}

export function extractDicomMetadata(dataSet) {
  return {
    patientName: dataSet.string('x00100010') || 'Unknown',
    patientID: dataSet.string('x00100020') || 'Unknown',
    studyDate: dataSet.string('x00080020') || 'Unknown',
    studyTime: dataSet.string('x00080030') || 'Unknown',
    studyInstanceUID: dataSet.string('x0020000d') || 'Unknown',
    seriesInstanceUID: dataSet.string('x0020000e') || 'Unknown',
    seriesNumber: dataSet.string('x00200011') || '0',
    instanceNumber: dataSet.string('x00200013') || '0',
    modality: dataSet.string('x00080060') || 'Unknown',
    studyDescription: dataSet.string('x00081030') || 'Unknown',
    seriesDescription: dataSet.string('x0008103e') || 'Unknown',
    sliceThickness: dataSet.string('x00180050') || 'Unknown',
    pixelSpacing: dataSet.string('x00280030') || 'Unknown',
    rows: dataSet.uint16('x00280010') || 0,
    columns: dataSet.uint16('x00280011') || 0,
    bitsAllocated: dataSet.uint16('x00280100') || 0,
    bitsStored: dataSet.uint16('x00280101') || 0,
    highBit: dataSet.uint16('x00280102') || 0,
    pixelRepresentation: dataSet.uint16('x00280103') || 0,
    numberOfFrames: dataSet.string('x00280008') || '1',
    windowCenter: dataSet.string('x00281050') || 'Not specified',
    windowWidth: dataSet.string('x00281051') || 'Not specified',
    rescaleIntercept: dataSet.string('x00281052') || '0',
    rescaleSlope: dataSet.string('x00281053') || '1'
  };
}

function generateThumbnail(dataSet) {
  try {
    const pixelData = dataSet.byteArray.slice(
      dataSet.elements.x7fe00010.dataOffset,
      dataSet.elements.x7fe00010.dataOffset + dataSet.elements.x7fe00010.length
    );

    const rows = parseInt(dataSet.string('x00280010'));
    const columns = parseInt(dataSet.string('x00280011'));
    const bitsAllocated = parseInt(dataSet.string('x00280100')) || 16;

    if (!pixelData || !rows || !columns) {
      return null;
    }

    // Create a simple thumbnail by sampling pixels
    const thumbnailSize = 64;
    const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;

    if (!canvas) {
      return null; // Server-side, can't generate canvas thumbnail
    }

    canvas.width = thumbnailSize;
    canvas.height = thumbnailSize;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(thumbnailSize, thumbnailSize);

    const stepX = Math.floor(columns / thumbnailSize);
    const stepY = Math.floor(rows / thumbnailSize);
    const bytesPerPixel = bitsAllocated / 8;

    for (let y = 0; y < thumbnailSize; y++) {
      for (let x = 0; x < thumbnailSize; x++) {
        const sourceX = x * stepX;
        const sourceY = y * stepY;
        const sourceIndex = (sourceY * columns + sourceX) * bytesPerPixel;

        let pixelValue = 0;
        if (bytesPerPixel === 2) {
          pixelValue = pixelData[sourceIndex] | (pixelData[sourceIndex + 1] << 8);
        } else {
          pixelValue = pixelData[sourceIndex];
        }

        // Normalize to 0-255 range
        const normalizedValue = Math.min(255, Math.max(0, pixelValue / (bitsAllocated === 16 ? 256 : 1)));

        const targetIndex = (y * thumbnailSize + x) * 4;
        imageData.data[targetIndex] = normalizedValue;     // R
        imageData.data[targetIndex + 1] = normalizedValue; // G
        imageData.data[targetIndex + 2] = normalizedValue; // B
        imageData.data[targetIndex + 3] = 255;             // A
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1]; // Return base64 without prefix
  } catch (error) {
    console.warn('Thumbnail generation failed:', error);
    return null;
  }
}

export function organizeDicomStudies(files) {
  const studies = {};

  for (const file of files) {
    try {
      const dataSet = parseDicomFile(file);
      const metadata = extractDicomMetadata(dataSet);

      // Generate thumbnail for the file
      let thumbnail = null;
      try {
        thumbnail = generateThumbnail(dataSet);
      } catch (thumbnailError) {
        console.warn(`Failed to generate thumbnail for ${file}:`, thumbnailError);
      }

      // Use filename as key for direct viewer access
      studies[file] = {
        filename: file,
        studyInstanceUID: metadata.studyInstanceUID,
        seriesInstanceUID: metadata.seriesInstanceUID,
        patientName: metadata.patientName,
        patientID: metadata.patientID,
        studyDate: metadata.studyDate,
        studyTime: metadata.studyTime,
        studyDescription: metadata.studyDescription,
        seriesDescription: metadata.seriesDescription,
        modality: metadata.modality,
        instanceNumber: parseInt(metadata.instanceNumber),
        seriesNumber: parseInt(metadata.seriesNumber),
        rows: metadata.rows,
        columns: metadata.columns,
        numberOfFrames: metadata.numberOfFrames,
        thumbnail: thumbnail
      };

    } catch (error) {
      console.error(`Error processing ${file}:`, error.message);
    }
  }

  return studies;
}

export function getSeriesFiles(filename) {
  try {
    const dataSet = parseDicomFile(filename);
    const targetSeriesUID = dataSet.string('x0020000e');
    const targetStudyUID = dataSet.string('x0020000d');

    if (!targetSeriesUID) {
      return { files: [filename] };
    }

    const files = getDicomFiles();
    const seriesFiles = [];

    for (const file of files) {
      try {
        const fileDataSet = parseDicomFile(file);
        const fileSeriesUID = fileDataSet.string('x0020000e');
        const fileStudyUID = fileDataSet.string('x0020000d');
        const instanceNumber = parseInt(fileDataSet.string('x00200013') || '0');

        if (fileSeriesUID === targetSeriesUID && fileStudyUID === targetStudyUID) {
          seriesFiles.push({
            filename: file,
            instanceNumber: instanceNumber
          });
        }
      } catch (error) {
        console.error(`Error processing ${file}:`, error.message);
      }
    }

    // Sort by instance number
    seriesFiles.sort((a, b) => a.instanceNumber - b.instanceNumber);

    return {
      seriesUID: targetSeriesUID,
      studyUID: targetStudyUID,
      files: seriesFiles.map(f => f.filename),
      totalInstances: seriesFiles.length
    };

  } catch (error) {
    console.error('Error getting series files:', error);
    throw error;
  }
}
