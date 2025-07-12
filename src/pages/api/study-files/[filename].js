import { getDicomFilesByPatientId, parseDicomFile } from '../../../lib/dicom';
import { requireAuth, validatePatientFileAccess } from '../../../lib/auth-middleware';

async function handler(req, res) {
  const { filename } = req.query;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Validate patient access to the requested file
    const validation = validatePatientFileAccess(req, filename);

    if (!validation.isValid) {
      return res.status(403).json({ error: validation.error });
    }

    console.log('Getting study files for:', validation.patientFilePath);

    // Parse the current file to get its study ID
    const currentFileDataSet = parseDicomFile(validation.patientFilePath);
    const currentStudyUID = currentFileDataSet.string('x0020000d'); // Study Instance UID

    if (!currentStudyUID) {
      return res.status(400).json({ error: 'Could not determine study ID from current file' });
    }

    console.log('Current file study UID:', currentStudyUID);

    // Get all files for this patient
    const patientFiles = getDicomFilesByPatientId(validation.patientId);

    // Filter files to only include those from the same study
    const studyFiles = [];

    for (const file of patientFiles) {
      try {
        const fileDataSet = parseDicomFile(file);
        const fileStudyUID = fileDataSet.string('x0020000d');

        if (fileStudyUID === currentStudyUID) {
          // Get additional metadata for sorting
          const seriesNumber = parseInt(fileDataSet.string('x00200011') || '0');
          const instanceNumber = parseInt(fileDataSet.string('x00200013') || '0');

          studyFiles.push({
            name: file,
            studyUID: fileStudyUID,
            seriesNumber: seriesNumber,
            instanceNumber: instanceNumber
          });
        }
      } catch (parseError) {
        console.warn(`Could not parse file ${file}:`, parseError.message);
        // Skip files that can't be parsed
      }
    }

    // Sort files by series number, then by instance number
    studyFiles.sort((a, b) => {
      if (a.seriesNumber !== b.seriesNumber) {
        return a.seriesNumber - b.seriesNumber;
      }
      return a.instanceNumber - b.instanceNumber;
    });

    // Group files by series for better navigation (same as admin)
    const seriesByNumber = {};
    const seriesDetectionLog = [];
    let filesWithoutSeries = 0;
    let parseErrors = 0;

    console.log(`🔍 Starting series detection for ${studyFiles.length} files...`);

    studyFiles.forEach((file, index) => {
      try {
        // Try to get series number from the file object first
        let seriesNum = file.seriesNumber;

        // If not available, try to parse the file directly
        if (!seriesNum || seriesNum === 0) {
          try {
            const fileDataSet = parseDicomFile(file.name);

            // Try multiple methods to get series number
            seriesNum = fileDataSet.uint16('x00200011') || // Series Number (uint16)
              parseInt(fileDataSet.string('x00200011')) || // Series Number (string)
              fileDataSet.uint16('x0020000e') || // Series Instance UID hash
              1; // Default fallback

            console.log(`📄 File ${index + 1}: ${file.name} -> Series ${seriesNum}`);
          } catch (parseError) {
            parseErrors++;
            seriesNum = 999; // Put unparseable files in a separate series
            console.warn(`⚠️ Could not parse file ${file.name}:`, parseError.message);
          }
        }

        if (!seriesNum || seriesNum === 0) {
          filesWithoutSeries++;
          seriesNum = 1; // Default series
        }

        // Initialize series if not exists
        if (!seriesByNumber[seriesNum]) {
          seriesByNumber[seriesNum] = {
            seriesNumber: seriesNum,
            files: [],
            seriesDescription: null,
            seriesInstanceUID: null
          };
        }

        seriesByNumber[seriesNum].files.push(file);

        // Get series description and UID from first file in series
        if (!seriesByNumber[seriesNum].seriesDescription) {
          try {
            const fileDataSet = parseDicomFile(file.name);
            seriesByNumber[seriesNum].seriesDescription =
              fileDataSet.string('x0008103e') || // Series Description
              fileDataSet.string('x00081030') || // Study Description as fallback
              `Series ${seriesNum}`;

            seriesByNumber[seriesNum].seriesInstanceUID =
              fileDataSet.string('x0020000e') || null; // Series Instance UID

          } catch (error) {
            seriesByNumber[seriesNum].seriesDescription = `Series ${seriesNum}`;
          }
        }

      } catch (error) {
        parseErrors++;
        console.error(`❌ Error processing file ${file.name}:`, error);

        // Add to error series
        if (!seriesByNumber[999]) {
          seriesByNumber[999] = {
            seriesNumber: 999,
            files: [],
            seriesDescription: 'Unparseable Files',
            seriesInstanceUID: null
          };
        }
        seriesByNumber[999].files.push(file);
      }
    });

    // Alternative grouping by Series Instance UID to catch missed series
    const seriesByUID = {};
    studyFiles.forEach(file => {
      try {
        const fileDataSet = parseDicomFile(file.name);
        const seriesUID = fileDataSet.string('x0020000e');
        const seriesNum = fileDataSet.uint16('x00200011') || parseInt(fileDataSet.string('x00200011')) || 1;

        if (seriesUID && !seriesByUID[seriesUID]) {
          seriesByUID[seriesUID] = {
            seriesInstanceUID: seriesUID,
            seriesNumber: seriesNum,
            files: [],
            seriesDescription: fileDataSet.string('x0008103e') || `Series ${seriesNum}`
          };
        }

        if (seriesUID) {
          seriesByUID[seriesUID].files.push(file);
        }
      } catch (error) {
        // Skip files that can't be parsed
      }
    });

    const seriesByUIDArray = Object.values(seriesByUID).sort((a, b) => a.seriesNumber - b.seriesNumber);

    console.log(`🔍 Alternative UID-based detection found ${seriesByUIDArray.length} unique series:`);
    seriesByUIDArray.forEach((series, index) => {
      console.log(`   ${index + 1}. Series ${series.seriesNumber} (UID: ${series.seriesInstanceUID.substring(0, 20)}...): ${series.files.length} files - "${series.seriesDescription}"`);
    });

    // Use the method that finds more series
    const seriesArray = seriesByUIDArray.length > Object.values(seriesByNumber).length
      ? seriesByUIDArray
      : Object.values(seriesByNumber).sort((a, b) => a.seriesNumber - b.seriesNumber);

    console.log(`📊 Using ${seriesByUIDArray.length > Object.values(seriesByNumber).length ? 'UID-based' : 'number-based'} grouping (found more series)`);

    // Find current series
    const currentFile = studyFiles.find(f => f.name === validation.patientFilePath);
    const currentSeriesNumber = currentFile?.seriesNumber || 1;
    const currentSeriesIndex = seriesArray.findIndex(s => s.seriesNumber === currentSeriesNumber);

    console.log(`📋 PATIENT SERIES ANALYSIS for study ${currentStudyUID}:`);
    console.log(`   Total files: ${studyFiles.length}`);
    console.log(`   Series detected: ${seriesArray.length}`);

    console.log('📊 Detailed series breakdown:');
    seriesArray.forEach((series, index) => {
      console.log(`   ${index + 1}. Series ${series.seriesNumber}: ${series.files.length} files`);
      console.log(`      Description: "${series.seriesDescription}"`);
    });

    res.status(200).json({
      files: studyFiles,
      series: seriesArray,
      studyUID: currentStudyUID,
      currentFile: validation.patientFilePath,
      currentSeriesIndex: Math.max(0, currentSeriesIndex),
      totalFiles: studyFiles.length,
      totalSeries: seriesArray.length
    });
  } catch (error) {
    console.error('Error getting study files:', error);
    res.status(500).json({ error: 'Error loading study files' });
  }
}

export default requireAuth(handler);
