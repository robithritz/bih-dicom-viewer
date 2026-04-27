import { getDicomFiles, getDicomFilesByPatientId, parseDicomFile } from '../../../lib/dicom';
import { requireAuth, validatePatientFileAccess } from '../../../lib/auth-middleware';

async function handler(req, res) {
  const { filename } = req.query;

  if (req.method !== 'GET') {
    console.warn('[patient study-files] 405 Method not allowed', { method: req.method });
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const start = Date.now();
    const authPresent = !!req.headers?.authorization;
    console.log('[patient study-files] request start', {
      method: req.method,
      rawFilename: filename,
      authPresent
    });

    // Decode in case client passed an encoded slash (%2F)
    const decodedFilename = Array.isArray(filename)
      ? decodeURIComponent(filename[0])
      : decodeURIComponent(filename || '');
    console.log('[patient study-files] decoded filename', { decodedFilename });

    // Validate patient access to the requested file
    const validation = validatePatientFileAccess(req, decodedFilename);
    console.log('[patient study-files] validation result', {
      isValid: validation?.isValid,
      patientId: validation?.patientId,
      folderName: validation?.folderName,
      patientFilePath: validation?.patientFilePath,
      sessionUrn: req.patient?.urn,
      multiUrnCount: Array.isArray(req.patient?.multiUrn) ? req.patient.multiUrn.length : 0,
      loginBy: req.patient?.loginBy
    });

    if (!validation.isValid) {
      console.warn('[patient study-files] access validation failed', { error: validation.error });
      return res.status(403).json({ error: validation.error });
    }

    // Parse the current file to get its study ID
    const currentFileDataSet = parseDicomFile(validation.patientFilePath);
    const currentStudyUID = currentFileDataSet.string('x0020000d'); // Study Instance UID
    console.log('[patient study-files] current file parsed', {
      filePath: validation.patientFilePath,
      currentStudyUID
    });

    if (!currentStudyUID) {
      console.warn('[patient study-files] no StudyInstanceUID extracted from current file');
      return res.status(400).json({ error: 'Could not determine study ID from current file' });
    }

    // Get all files for this patient (and also from the specific folder as a safety net)
    const byPatientFiles = getDicomFilesByPatientId(validation.patientId) || [];
    let patientFiles = byPatientFiles;
    let folderFilesCount = 0;
    if (validation.folderName) {
      try {
        const folderFiles = getDicomFiles(validation.folderName) || [];
        folderFilesCount = folderFiles.length;
        const merged = new Set([...(patientFiles || []), ...folderFiles]);
        patientFiles = Array.from(merged);
      } catch (_) { /* noop */ }
    }
    console.log('[patient study-files] file discovery', {
      byPatientCount: byPatientFiles.length,
      byFolderCount: folderFilesCount,
      mergedCount: patientFiles.length,
      folderName: validation.folderName
    });

    // Filter files to only include those from the same study
    const studyFiles = [];
    let initialParseErrors = 0;
    let nonImageSkipped = 0;
    let matchedStudyCount = 0;

    for (const file of patientFiles) {
      try {
        const fileDataSet = parseDicomFile(file);
        const fileStudyUID = fileDataSet.string('x0020000d');

        if (fileStudyUID === currentStudyUID) {
          // Skip non-image objects (PR/SR) by requiring pixel data and valid dimensions
          const hasPixel = !!(fileDataSet.elements && fileDataSet.elements.x7fe00010);
          const rows = fileDataSet.uint16('x00280010') || 0;
          const columns = fileDataSet.uint16('x00280011') || 0;
          if (!hasPixel || rows === 0 || columns === 0) {
            nonImageSkipped++;
            continue;
          }

          // Get additional metadata for sorting
          const seriesNumber = parseInt(fileDataSet.string('x00200011') || '0');
          const instanceNumber = parseInt(fileDataSet.string('x00200013') || '0');

          studyFiles.push({
            name: file,
            studyUID: fileStudyUID,
            seriesNumber: seriesNumber,
            instanceNumber: instanceNumber
          });
          matchedStudyCount++;
        }
      } catch (parseError) {
        initialParseErrors++;
        console.warn(`Could not parse file ${file}:`, parseError.message);
        // Skip files that can't be parsed
      }
    }
    console.log('[patient study-files] filter summary', {
      matchedStudyCount,
      nonImageSkipped,
      initialParseErrors,
      studyFilesCount: studyFiles.length
    });

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
    console.log('[patient study-files] grouping summary', {
      seriesByNumberCount: Object.values(seriesByNumber).length,
      seriesByUIDCount: seriesByUIDArray.length,
      filesWithoutSeries,
      parseErrors
    });

    // Use the method that finds more series
    const useUID = seriesByUIDArray.length > Object.values(seriesByNumber).length;
    const seriesArray = useUID
      ? seriesByUIDArray
      : Object.values(seriesByNumber).sort((a, b) => a.seriesNumber - b.seriesNumber);
    console.log('[patient study-files] chosen series method', {
      method: useUID ? 'byUID' : 'byNumber',
      totalSeries: seriesArray.length
    });

    // Find current series
    const currentFile = studyFiles.find(f => f.name === validation.patientFilePath);
    const currentSeriesNumber = currentFile?.seriesNumber || 1;
    const currentSeriesIndex = seriesArray.findIndex(s => s.seriesNumber === currentSeriesNumber);
    console.log('[patient study-files] current positioning', {
      currentFile: validation.patientFilePath,
      currentSeriesNumber,
      currentSeriesIndex: Math.max(0, currentSeriesIndex)
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
    console.log('[patient study-files] response sent', {
      totalFiles: studyFiles.length,
      totalSeries: seriesArray.length,
      durationMs: Date.now() - start
    });
  } catch (error) {
    console.error('[patient study-files] Error getting study files:', error);
    res.status(500).json({ error: 'Error loading study files' });
  }
}

export default requireAuth(handler);
