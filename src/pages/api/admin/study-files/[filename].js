import { getDicomFiles, getDicomFilesByPatientId, parseDicomFile } from '../../../../lib/dicom';
import { requireAdminAuth } from '../../../../lib/admin-auth-middleware';

async function handler(req, res) {
  const { filename } = req.query;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Admin getting study files for:', filename);

    // Parse the filename parameter which might be in format "folderName/filename" or just "filename"
    let folderName, actualFilename, filePath;

    if (filename.includes('/')) {
      // Format: "folderName/filename"
      [folderName, actualFilename] = filename.split('/');
      filePath = filename;
    } else {
      // Format: just "filename" - try to find it in any folder
      filePath = filename;
      actualFilename = filename;
    }

    console.log('Parsed filename:', { folderName, actualFilename, filePath });

    // Parse the current file to get its study ID
    const currentFileDataSet = parseDicomFile(filePath);
    const currentStudyUID = currentFileDataSet.string('x0020000d'); // Study Instance UID

    if (!currentStudyUID) {
      return res.status(400).json({ error: 'Could not determine study ID from current file' });
    }

    console.log('Current file study UID:', currentStudyUID);

    // Get all files (admin can access all files)
    let allFiles;
    if (folderName) {
      // If we have a folder name, get files from that folder and also search by patient ID
      const folderPatientId = folderName.split('_')[0]; // Extract patient ID from folder name
      allFiles = getDicomFiles(folderName); // Files from specific folder

      // Also get files from other folders for the same patient
      const patientFiles = getDicomFilesByPatientId(folderPatientId);

      // Combine and deduplicate
      const allFilesSet = new Set([...allFiles, ...patientFiles]);
      allFiles = Array.from(allFilesSet);
    } else {
      // Get all files from all folders
      allFiles = getDicomFiles(null);
    }

    // Filter files to only include those from the same study
    const studyFiles = [];

    for (const file of allFiles) {
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

    // Enhanced series grouping with better error handling
    const seriesByNumber = {};
    const seriesDetectionLog = [];
    let filesWithoutSeries = 0;
    let parseErrors = 0;

    console.log(`🔍 Starting series detection for ${studyFiles.length} files...`);

    // Debug: Examine first 10 files in detail
    console.log(`🧪 DEBUGGING: Examining first 10 files in detail...`);
    studyFiles.slice(0, 10).forEach((file, index) => {
      try {
        const fileDataSet = parseDicomFile(file.name);
        const seriesNum = fileDataSet.uint16('x00200011') || parseInt(fileDataSet.string('x00200011')) || 'MISSING';
        const seriesUID = fileDataSet.string('x0020000e') || 'MISSING';
        const seriesDesc = fileDataSet.string('x0008103e') || 'MISSING';

        console.log(`   File ${index + 1}: ${file.name}`);
        console.log(`      Series Number: ${seriesNum}`);
        console.log(`      Series UID: ${seriesUID}`);
        console.log(`      Series Description: ${seriesDesc}`);
      } catch (error) {
        console.log(`   File ${index + 1}: ${file.name} - PARSE ERROR: ${error.message}`);
      }
    });

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

        seriesDetectionLog.push({
          file: file.name,
          detectedSeries: seriesNum,
          method: file.seriesNumber ? 'from_file_object' : 'from_dicom_parsing'
        });

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

    // Quick scan of ALL files to find unique series numbers and UIDs
    console.log(`🔍 COMPREHENSIVE SCAN: Checking all ${studyFiles.length} files for unique series...`);
    const allSeriesNumbers = new Set();
    const allSeriesUIDs = new Set();
    const seriesNumberToUID = {};
    let scanParseErrors = 0;

    studyFiles.forEach((file, index) => {
      try {
        const fileDataSet = parseDicomFile(file.name);
        const seriesNum = fileDataSet.uint16('x00200011') || parseInt(fileDataSet.string('x00200011'));
        const seriesUID = fileDataSet.string('x0020000e');

        if (seriesNum) {
          allSeriesNumbers.add(seriesNum);
          if (seriesUID) {
            allSeriesUIDs.add(seriesUID);
            if (!seriesNumberToUID[seriesNum]) {
              seriesNumberToUID[seriesNum] = new Set();
            }
            seriesNumberToUID[seriesNum].add(seriesUID);
          }
        }

        // Log every 100th file for progress
        if (index % 100 === 0) {
          console.log(`   Scanned ${index + 1}/${studyFiles.length} files...`);
        }
      } catch (error) {
        scanParseErrors++;
      }
    });

    console.log(`📊 COMPREHENSIVE SCAN RESULTS:`);
    console.log(`   Unique Series Numbers found: ${allSeriesNumbers.size} -> [${Array.from(allSeriesNumbers).sort((a, b) => a - b).join(', ')}]`);
    console.log(`   Unique Series UIDs found: ${allSeriesUIDs.size}`);
    console.log(`   Parse errors during scan: ${scanParseErrors}`);

    console.log(`📊 Series Number to UID mapping:`);
    Object.keys(seriesNumberToUID).sort((a, b) => parseInt(a) - parseInt(b)).forEach(seriesNum => {
      const uids = Array.from(seriesNumberToUID[seriesNum]);
      console.log(`   Series ${seriesNum}: ${uids.length} unique UID(s)`);
      uids.forEach((uid, index) => {
        console.log(`      ${index + 1}. ${uid}`);
      });
    });

    console.log(`📊 Original series detection summary:`, {
      totalFiles: studyFiles.length,
      seriesDetected: Object.keys(seriesByNumber).length,
      filesWithoutSeries,
      parseErrors,
      seriesNumbers: Object.keys(seriesByNumber).sort((a, b) => parseInt(a) - parseInt(b))
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

    // Convert to array and sort by series number
    // const seriesArray = Object.values(seriesByNumber).sort((a, b) => a.seriesNumber - b.seriesNumber);

    // Find current series
    const currentFile = studyFiles.find(f => f.name === filePath);
    const currentSeriesNumber = currentFile?.seriesNumber || 1;
    const currentSeriesIndex = seriesArray.findIndex(s => s.seriesNumber === currentSeriesNumber);

    console.log(`📋 FINAL SERIES ANALYSIS for study ${currentStudyUID}:`);
    console.log(`   Total files: ${studyFiles.length}`);
    console.log(`   Series detected: ${seriesArray.length}`);
    console.log(`   Expected series: 8 (you mentioned)`);

    if (seriesArray.length !== 8) {
      console.warn(`⚠️ SERIES COUNT MISMATCH: Expected 8 series, found ${seriesArray.length}`);
    }

    console.log('📊 Detailed series breakdown:');
    seriesArray.forEach((series, index) => {
      console.log(`   ${index + 1}. Series ${series.seriesNumber}: ${series.files.length} files`);
      console.log(`      Description: "${series.seriesDescription}"`);
      console.log(`      UID: ${series.seriesInstanceUID || 'N/A'}`);
      console.log(`      Sample files: ${series.files.slice(0, 3).map(f => f.name).join(', ')}${series.files.length > 3 ? '...' : ''}`);
    });

    // Log any potential issues
    if (filesWithoutSeries > 0) {
      console.warn(`⚠️ ${filesWithoutSeries} files had no series number`);
    }
    if (parseErrors > 0) {
      console.warn(`⚠️ ${parseErrors} files had parsing errors`);
    }

    res.status(200).json({
      files: studyFiles,
      series: seriesArray,
      studyUID: currentStudyUID,
      currentFile: filePath,
      currentSeriesIndex: Math.max(0, currentSeriesIndex),
      totalFiles: studyFiles.length,
      totalSeries: seriesArray.length
    });
  } catch (error) {
    console.error('Error getting study files:', error);
    res.status(500).json({ error: 'Error loading study files' });
  }
}

export default requireAdminAuth(handler);
