const express = require('express');
const fs = require('fs');
const path = require('path');
const dicomParser = require('dicom-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static('public'));
app.use('/dicom', express.static('DICOM'));

// Set view engine
app.set('view engine', 'ejs');
app.set('views', './views');

// Route to display all DICOM images organized by studies and series
app.get('/', async (req, res) => {
    try {
        const dicomDir = path.join(__dirname, 'DICOM');
        const files = fs.readdirSync(dicomDir);
        const dicomFiles = files.filter(file => file.endsWith('.dcm'));

        const studies = {};

        for (const file of dicomFiles) {
            try {
                const filePath = path.join(dicomDir, file);
                const dicomFileAsBuffer = fs.readFileSync(filePath);
                const dataSet = dicomParser.parseDicom(dicomFileAsBuffer);

                // Extract comprehensive DICOM metadata
                const patientName = dataSet.string('x00100010') || 'Unknown';
                const patientID = dataSet.string('x00100020') || 'Unknown';
                const studyDate = dataSet.string('x00080020') || 'Unknown';
                const studyTime = dataSet.string('x00080030') || 'Unknown';
                const studyInstanceUID = dataSet.string('x0020000d') || 'Unknown';
                const seriesInstanceUID = dataSet.string('x0020000e') || 'Unknown';
                const seriesNumber = dataSet.string('x00200011') || '0';
                const instanceNumber = dataSet.string('x00200013') || '0';
                const modality = dataSet.string('x00080060') || 'Unknown';
                const studyDescription = dataSet.string('x00081030') || 'Unknown';
                const seriesDescription = dataSet.string('x0008103e') || 'Unknown';
                const rows = dataSet.uint16('x00280010') || 0;
                const columns = dataSet.uint16('x00280011') || 0;

                // Organize by study
                if (!studies[studyInstanceUID]) {
                    studies[studyInstanceUID] = {
                        studyInstanceUID,
                        patientName,
                        patientID,
                        studyDate,
                        studyTime,
                        studyDescription,
                        series: {}
                    };
                }

                // Organize by series within study
                if (!studies[studyInstanceUID].series[seriesInstanceUID]) {
                    studies[studyInstanceUID].series[seriesInstanceUID] = {
                        seriesInstanceUID,
                        seriesNumber: parseInt(seriesNumber),
                        seriesDescription,
                        modality,
                        instances: []
                    };
                }

                // Add instance to series
                studies[studyInstanceUID].series[seriesInstanceUID].instances.push({
                    filename: file,
                    instanceNumber: parseInt(instanceNumber),
                    rows,
                    columns
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

        res.render('index', { studies });
    } catch (error) {
        console.error('Error reading DICOM directory:', error);
        res.status(500).send('Error loading DICOM files');
    }
});

// Route to display individual DICOM image in advanced viewer
app.get('/viewer/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'DICOM', filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).send('DICOM file not found');
    }

    res.render('viewer', { filename });
});

// Route for test viewer
app.get('/test/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'DICOM', filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).send('DICOM file not found');
    }

    res.render('test-viewer', { filename });
});

// Route to get all files in the same series as the given file
app.get('/series-files/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(__dirname, 'DICOM', filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }

        // Get the series UID of the requested file
        const dicomFileAsBuffer = fs.readFileSync(filePath);
        const dataSet = dicomParser.parseDicom(dicomFileAsBuffer);
        const targetSeriesUID = dataSet.string('x0020000e');
        const targetStudyUID = dataSet.string('x0020000d');

        if (!targetSeriesUID) {
            return res.json({ files: [filename] });
        }

        // Find all files in the same series
        const dicomDir = path.join(__dirname, 'DICOM');
        const files = fs.readdirSync(dicomDir);
        const dicomFiles = files.filter(file => file.endsWith('.dcm'));

        const seriesFiles = [];

        for (const file of dicomFiles) {
            try {
                const fileBuffer = fs.readFileSync(path.join(dicomDir, file));
                const fileDataSet = dicomParser.parseDicom(fileBuffer);
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

        res.json({
            seriesUID: targetSeriesUID,
            studyUID: targetStudyUID,
            files: seriesFiles.map(f => f.filename),
            totalInstances: seriesFiles.length
        });

    } catch (error) {
        console.error('Error getting series files:', error);
        res.status(500).json({ error: 'Error getting series files' });
    }
});

// Route to serve individual DICOM file as JSON metadata
app.get('/dicom-info/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(__dirname, 'DICOM', filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }

        const dicomFileAsBuffer = fs.readFileSync(filePath);
        const dataSet = dicomParser.parseDicom(dicomFileAsBuffer);

        // Extract comprehensive metadata
        const metadata = {
            patientName: dataSet.string('x00100010') || 'Unknown',
            patientID: dataSet.string('x00100020') || 'Unknown',
            studyDate: dataSet.string('x00080020') || 'Unknown',
            studyTime: dataSet.string('x00080030') || 'Unknown',
            modality: dataSet.string('x00080060') || 'Unknown',
            studyDescription: dataSet.string('x00081030') || 'Unknown',
            seriesDescription: dataSet.string('x0008103e') || 'Unknown',
            instanceNumber: dataSet.string('x00200013') || '0',
            sliceThickness: dataSet.string('x00180050') || 'Unknown',
            pixelSpacing: dataSet.string('x00280030') || 'Unknown',
            rows: dataSet.uint16('x00280010') || 0,
            columns: dataSet.uint16('x00280011') || 0,
            bitsAllocated: dataSet.uint16('x00280100') || 0,
            bitsStored: dataSet.uint16('x00280101') || 0,
            highBit: dataSet.uint16('x00280102') || 0,
            pixelRepresentation: dataSet.uint16('x00280103') || 0
        };

        res.json(metadata);
    } catch (error) {
        console.error('Error parsing DICOM file:', error);
        res.status(500).json({ error: 'Error parsing DICOM file' });
    }
});

// API endpoint to get list of DICOM files
app.get('/api/files', (req, res) => {
    try {
        const dicomDir = path.join(__dirname, 'DICOM');
        const files = fs.readdirSync(dicomDir)
            .filter(file => file.toLowerCase().endsWith('.dcm'))
            .map(file => ({
                name: file,
                path: path.join(dicomDir, file)
            }));

        console.log(`Found ${files.length} DICOM files`);
        res.json(files);
    } catch (error) {
        console.error('Error reading DICOM directory:', error);
        res.status(500).json({ error: 'Error reading DICOM directory' });
    }
});

// Handle CORS preflight requests
app.options('/dicom-file/:filename', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.sendStatus(200);
});

// Route to serve raw DICOM files for Cornerstone.js
app.get('/dicom-file/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(__dirname, 'DICOM', filename);

        console.log('Serving DICOM file:', filename, 'from path:', filePath);

        if (!fs.existsSync(filePath)) {
            console.error('DICOM file not found:', filePath);
            return res.status(404).json({ error: 'File not found' });
        }

        // Set appropriate headers for DICOM files
        res.setHeader('Content-Type', 'application/dicom');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

        // Read and send the file buffer
        const fileBuffer = fs.readFileSync(filePath);
        console.log('DICOM file size:', fileBuffer.length, 'bytes');
        res.send(fileBuffer);

    } catch (error) {
        console.error('Error serving DICOM file:', error);
        res.status(500).json({ error: 'Error serving DICOM file' });
    }
});

// Route to convert DICOM to viewable format (enhanced with more details)
app.get('/dicom-image/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(__dirname, 'DICOM', filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }

        const dicomFileAsBuffer = fs.readFileSync(filePath);
        const dataSet = dicomParser.parseDicom(dicomFileAsBuffer);

        // Get comprehensive image information
        const rows = dataSet.uint16('x00280010');
        const columns = dataSet.uint16('x00280011');
        const pixelData = dataSet.elements.x7fe00010;
        const windowCenter = dataSet.string('x00281050');
        const windowWidth = dataSet.string('x00281051');
        const rescaleIntercept = dataSet.string('x00281052');
        const rescaleSlope = dataSet.string('x00281053');

        res.json({
            rows,
            columns,
            pixelDataLength: pixelData ? pixelData.length : 0,
            hasPixelData: !!pixelData,
            windowCenter: windowCenter || 'Not specified',
            windowWidth: windowWidth || 'Not specified',
            rescaleIntercept: rescaleIntercept || '0',
            rescaleSlope: rescaleSlope || '1',
            cornerstoneUrl: `/dicom-file/${filename}`,
            message: 'Enhanced DICOM data for Cornerstone.js rendering'
        });

    } catch (error) {
        console.error('Error extracting image data:', error);
        res.status(500).json({ error: 'Error extracting image data' });
    }
});

app.listen(PORT, () => {
    console.log(`DICOM Viewer server running on http://localhost:${PORT}`);
});
