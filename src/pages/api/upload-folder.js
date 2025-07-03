import formidable from 'formidable';
import fs from 'fs';
import path from 'path';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const form = formidable({
      multiples: true,
      keepExtensions: true,
      maxFileSize: 100 * 1024 * 1024, // 100MB per file
    });

    const [fields, files] = await form.parse(req);
    const patientId = fields.patientId?.[0];

    if (!patientId) {
      return res.status(400).json({ error: 'Patient ID is required' });
    }

    // Validate patient ID format (alphanumeric, hyphens, underscores)
    if (!/^[a-zA-Z0-9_-]+$/.test(patientId)) {
      return res.status(400).json({ error: 'Invalid patient ID format' });
    }

    const uploadedFiles = files.files || [];
    const fileArray = Array.isArray(uploadedFiles) ? uploadedFiles : [uploadedFiles];

    if (fileArray.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // Create patient directory
    const patientDir = path.join(process.cwd(), 'DICOM', patientId);
    if (!fs.existsSync(patientDir)) {
      fs.mkdirSync(patientDir, { recursive: true });
    }

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (const file of fileArray) {
      try {
        // Validate file extension
        const ext = path.extname(file.originalFilename || file.newFilename).toLowerCase();
        if (ext !== '.dcm' && ext !== '.dicom') {
          results.push({
            filename: file.originalFilename || file.newFilename,
            status: 'error',
            message: 'Invalid file type. Only .dcm and .dicom files are allowed.'
          });
          errorCount++;
          continue;
        }

        // Generate unique filename if file already exists
        let targetFilename = file.originalFilename || file.newFilename;
        let targetPath = path.join(patientDir, targetFilename);
        let counter = 1;

        while (fs.existsSync(targetPath)) {
          const name = path.parse(targetFilename).name;
          const ext = path.parse(targetFilename).ext;
          targetFilename = `${name}_${counter}${ext}`;
          targetPath = path.join(patientDir, targetFilename);
          counter++;
        }

        // Move file to patient directory
        fs.copyFileSync(file.filepath, targetPath);
        fs.unlinkSync(file.filepath); // Clean up temp file

        results.push({
          filename: file.originalFilename || file.newFilename,
          targetFilename: targetFilename,
          status: 'success',
          message: 'File uploaded successfully'
        });
        successCount++;

      } catch (error) {
        console.error('Error processing file:', error);
        results.push({
          filename: file.originalFilename || file.newFilename,
          status: 'error',
          message: 'Failed to process file'
        });
        errorCount++;
      }
    }

    res.status(200).json({
      success: true,
      patientId,
      totalFiles: fileArray.length,
      successCount,
      errorCount,
      results
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload files' });
  }
}
