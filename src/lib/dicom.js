import fs from 'fs';
import path from 'path';
import dicomParser from 'dicom-parser';

export const DICOM_DIR = path.join(process.cwd(), 'DICOM');

export function getDicomFiles() {
  try {
    const files = fs.readdirSync(DICOM_DIR);
    return files.filter(file => file.toLowerCase().endsWith('.dcm'));
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

export function organizeDicomStudies(files) {
  const studies = {};

  for (const file of files) {
    try {
      const dataSet = parseDicomFile(file);
      const metadata = extractDicomMetadata(dataSet);

      // Organize by study
      if (!studies[metadata.studyInstanceUID]) {
        studies[metadata.studyInstanceUID] = {
          studyInstanceUID: metadata.studyInstanceUID,
          patientName: metadata.patientName,
          patientID: metadata.patientID,
          studyDate: metadata.studyDate,
          studyTime: metadata.studyTime,
          studyDescription: metadata.studyDescription,
          series: {}
        };
      }

      // Organize by series within study
      if (!studies[metadata.studyInstanceUID].series[metadata.seriesInstanceUID]) {
        studies[metadata.studyInstanceUID].series[metadata.seriesInstanceUID] = {
          seriesInstanceUID: metadata.seriesInstanceUID,
          seriesNumber: parseInt(metadata.seriesNumber),
          seriesDescription: metadata.seriesDescription,
          modality: metadata.modality,
          instances: []
        };
      }

      // Add instance to series
      studies[metadata.studyInstanceUID].series[metadata.seriesInstanceUID].instances.push({
        filename: file,
        instanceNumber: parseInt(metadata.instanceNumber),
        rows: metadata.rows,
        columns: metadata.columns
      });

    } catch (error) {
      console.error(`Error processing ${file}:`, error.message);
    }
  }

  // Sort instances within each series by instance number
  Object.values(studies).forEach(study => {
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
