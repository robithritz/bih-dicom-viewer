import fs from 'fs';
import path from 'path';
import dicomParser from 'dicom-parser';

export const DICOM_DIR = path.join(process.cwd(), 'DICOM');

export function getDicomFiles(folderName = null) {
  try {
    if (folderName) {
      // Look for files in specific folder (could be patient ID or full folder name like "000012_0001")
      const targetDir = path.join(DICOM_DIR, folderName);
      if (fs.existsSync(targetDir)) {
        const files = fs.readdirSync(targetDir);
        return files
          .filter(file => file.toLowerCase().endsWith('.dcm') || file.toLowerCase().endsWith('.dicom'))
          .map(file => path.join(folderName, file)); // Include folder in path
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

/**
 * Get DICOM files for a specific patient ID by searching all folders
 * This handles the new folder structure where folders are named like "000012_0001"
 * but we want to find all files for patient "000012"
 */
export function getDicomFilesByPatientId(patientId) {
  try {
    const allFiles = [];

    if (!fs.existsSync(DICOM_DIR)) {
      return [];
    }

    const entries = fs.readdirSync(DICOM_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const folderName = entry.name;

        // Check if this folder belongs to the patient
        // Handle both old format (just patient ID) and new format (patient_episode)
        const folderPatientId = folderName.split('_')[0]; // Get patient ID part

        if (folderPatientId === patientId) {
          const folderPath = path.join(DICOM_DIR, folderName);
          const files = fs.readdirSync(folderPath);

          const dicomFiles = files
            .filter(file => file.toLowerCase().endsWith('.dcm') || file.toLowerCase().endsWith('.dicom'))
            .map(file => path.join(folderName, file)); // Include full folder name in path

          allFiles.push(...dicomFiles);
        }
      }
    }

    return allFiles;
  } catch (error) {
    console.error('Error reading DICOM files by patient ID:', error);
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

/**
 * Enhanced frame count extraction with multiple detection methods
 */
function extractFrameCount(dataSet) {
  try {
    // Method 1: Standard Number of Frames tag (0028,0008) as string
    const framesString = dataSet.string('x00280008');
    if (framesString && parseInt(framesString) > 1) {
      return framesString;
    }

    // Method 2: Number of Frames as uint16
    const framesUint16 = dataSet.uint16('x00280008');
    if (framesUint16 && framesUint16 > 1) {
      return framesUint16.toString();
    }

    // Method 3: Number of Frames as uint32
    const framesUint32 = dataSet.uint32('x00280008');
    if (framesUint32 && framesUint32 > 1) {
      return framesUint32.toString();
    }

    // Method 4: Check for Enhanced MR/CT multi-frame tags
    const enhancedFrames = dataSet.string('x00540081'); // Number of Slices
    if (enhancedFrames && parseInt(enhancedFrames) > 1) {
      return enhancedFrames;
    }

    // Method 5: Try to detect from pixel data size (rough estimation)
    const pixelData = dataSet.elements.x7fe00010;

    if (pixelData && pixelData.length) {
      const rows = dataSet.uint16('x00280010') || 512;
      const columns = dataSet.uint16('x00280011') || 512;
      const bitsAllocated = dataSet.uint16('x00280100') || 16;

      const expectedSingleFrameSize = rows * columns * (bitsAllocated / 8);
      const actualDataSize = pixelData.length;

      if (actualDataSize > expectedSingleFrameSize * 1.5) {
        const estimatedFrames = Math.round(actualDataSize / expectedSingleFrameSize);
        if (estimatedFrames > 1) {
          return estimatedFrames.toString();
        }
      }
    }

    return '1';
  } catch (error) {
    console.warn('Error extracting frame count:', error);
    return '1';
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
    numberOfFrames: extractFrameCount(dataSet),
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

      const studyId = metadata.studyInstanceUID;

      // Initialize study if it doesn't exist
      if (!studies[studyId]) {
        // Generate thumbnail for the first file of the study
        let thumbnail = null;
        try {
          thumbnail = generateThumbnail(dataSet);
        } catch (thumbnailError) {
          console.warn(`Failed to generate thumbnail for ${file}:`, thumbnailError);
        }

        studies[studyId] = {
          studyInstanceUID: studyId,
          patientName: metadata.patientName,
          patientID: metadata.patientID,
          studyDate: metadata.studyDate,
          studyTime: metadata.studyTime,
          studyDescription: metadata.studyDescription,
          modality: metadata.modality,
          thumbnail: thumbnail,
          firstFile: file, // Include patient ID in path for viewer redirect
          files: [],
          series: {}
        };
      }

      // Add file to the study
      studies[studyId].files.push({
        filename: file,
        seriesInstanceUID: metadata.seriesInstanceUID,
        seriesDescription: metadata.seriesDescription,
        instanceNumber: parseInt(metadata.instanceNumber),
        seriesNumber: parseInt(metadata.seriesNumber),
        rows: metadata.rows,
        columns: metadata.columns,
        numberOfFrames: metadata.numberOfFrames
      });

      // Organize by series within study
      const seriesId = metadata.seriesInstanceUID;
      if (!studies[studyId].series[seriesId]) {
        studies[studyId].series[seriesId] = {
          seriesInstanceUID: seriesId,
          seriesNumber: parseInt(metadata.seriesNumber),
          seriesDescription: metadata.seriesDescription,
          modality: metadata.modality,
          instances: []
        };
      }

      // Add instance to series
      studies[studyId].series[seriesId].instances.push({
        filename: file,
        instanceNumber: parseInt(metadata.instanceNumber),
        rows: metadata.rows,
        columns: metadata.columns,
        numberOfFrames: metadata.numberOfFrames
      });

    } catch (error) {
      console.error(`Error processing ${file}:`, error.message);
    }
  }

  // Sort files and instances within each study
  Object.values(studies).forEach(study => {
    // Sort files by series number and instance number
    study.files.sort((a, b) => {
      if (a.seriesNumber !== b.seriesNumber) {
        return a.seriesNumber - b.seriesNumber;
      }
      return a.instanceNumber - b.instanceNumber;
    });

    // Sort instances within each series
    Object.values(study.series).forEach(series => {
      series.instances.sort((a, b) => a.instanceNumber - b.instanceNumber);
    });
  });

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

    // Get all DICOM files to search for series files
    const files = getDicomFiles(); // Get all files from all folders
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
