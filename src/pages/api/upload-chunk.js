import formidable from 'formidable';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const config = {
  api: {
    bodyParser: false,
  },
};

// Store for tracking chunk uploads
const uploadSessions = new Map();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const form = formidable({
      multiples: false,
      keepExtensions: true,
      maxFileSize: 2 * 1024 * 1024, // 2MB per chunk
    });

    const [fields, files] = await form.parse(req);

    const patientId = fields.patientId?.[0];
    const filename = fields.filename?.[0];
    const chunkIndex = parseInt(fields.chunkIndex?.[0] || '0');
    const totalChunks = parseInt(fields.totalChunks?.[0] || '1');
    const fileHash = fields.fileHash?.[0];
    const totalSize = parseInt(fields.totalSize?.[0] || '0');

    if (!patientId || !filename || !fileHash) {
      return res.status(400).json({
        error: 'Missing required fields: patientId, filename, fileHash'
      });
    }

    // Validate patient ID format
    if (!/^[a-zA-Z0-9_-]+$/.test(patientId)) {
      return res.status(400).json({ error: 'Invalid patient ID format' });
    }

    // Validate file extension
    const ext = path.extname(filename).toLowerCase();
    if (ext !== '.dcm' && ext !== '.dicom') {
      return res.status(400).json({
        error: 'Invalid file type. Only .dcm and .dicom files are allowed.'
      });
    }

    // Validate chunk index
    if (chunkIndex < 0 || chunkIndex >= totalChunks) {
      return res.status(400).json({
        error: `Invalid chunk index: ${chunkIndex}. Must be between 0 and ${totalChunks - 1}`
      });
    }

    const chunkFile = files.chunk;
    if (!chunkFile) {
      return res.status(400).json({ error: 'No chunk file provided' });
    }

    // Handle both array and single file cases
    const file = Array.isArray(chunkFile) ? chunkFile[0] : chunkFile;

    // Check if file path exists (formidable v2/v3 compatibility)
    const filePath = file.filepath || file.path;
    if (!filePath) {
      console.error('Chunk file object:', file);
      return res.status(400).json({ error: 'Chunk file path not found' });
    }

    // Create session key
    const sessionKey = `${patientId}_${fileHash}`;

    // Initialize session if not exists
    if (!uploadSessions.has(sessionKey)) {
      uploadSessions.set(sessionKey, {
        patientId,
        filename,
        totalChunks,
        totalSize,
        receivedChunks: new Set(),
        chunks: new Map(),
        createdAt: Date.now()
      });
    }

    const session = uploadSessions.get(sessionKey);

    // Store chunk data
    const chunkBuffer = fs.readFileSync(filePath);
    session.chunks.set(chunkIndex, chunkBuffer);
    session.receivedChunks.add(chunkIndex);

    // Clean up temp file
    fs.unlinkSync(filePath);

    console.log(`Received chunk ${chunkIndex + 1}/${totalChunks} for ${filename}`);

    // Check if all chunks received
    if (session.receivedChunks.size === totalChunks) {
      try {
        // Create patient directory
        const patientDir = path.join(process.cwd(), 'DICOM', patientId);
        if (!fs.existsSync(patientDir)) {
          fs.mkdirSync(patientDir, { recursive: true });
        }

        // Generate unique filename if file already exists
        let targetFilename = filename;
        let targetPath = path.join(patientDir, targetFilename);
        let counter = 1;

        while (fs.existsSync(targetPath)) {
          const name = path.parse(filename).name;
          const ext = path.parse(filename).ext;
          targetFilename = `${name}_${counter}${ext}`;
          targetPath = path.join(patientDir, targetFilename);
          counter++;
        }

        // Combine chunks in order
        const writeStream = fs.createWriteStream(targetPath);

        for (let i = 0; i < totalChunks; i++) {
          const chunkData = session.chunks.get(i);
          if (!chunkData) {
            throw new Error(`Missing chunk ${i}`);
          }
          writeStream.write(chunkData);
        }

        writeStream.end();

        // Verify file size
        const stats = fs.statSync(targetPath);
        if (stats.size !== totalSize) {
          fs.unlinkSync(targetPath); // Clean up incomplete file
          throw new Error(`File size mismatch. Expected: ${totalSize}, Got: ${stats.size}`);
        }

        // Clean up session
        uploadSessions.delete(sessionKey);

        console.log(`Successfully assembled file: ${targetFilename} (${stats.size} bytes)`);

        return res.status(200).json({
          success: true,
          message: 'File upload completed',
          filename: targetFilename,
          originalFilename: filename,
          size: stats.size,
          patientId
        });

      } catch (error) {
        console.error('Error assembling file:', error);
        uploadSessions.delete(sessionKey);
        return res.status(500).json({
          error: 'Failed to assemble file chunks',
          details: error.message
        });
      }
    } else {
      // Return progress
      return res.status(200).json({
        success: true,
        message: 'Chunk received',
        progress: {
          received: session.receivedChunks.size,
          total: totalChunks,
          percentage: Math.round((session.receivedChunks.size / totalChunks) * 100)
        }
      });
    }

  } catch (error) {
    console.error('Chunk upload error:', error);
    res.status(500).json({
      error: 'Failed to process chunk',
      details: error.message
    });
  }
}

// Clean up old sessions (run periodically)
setInterval(() => {
  const now = Date.now();
  const maxAge = 30 * 60 * 1000; // 30 minutes

  for (const [key, session] of uploadSessions.entries()) {
    if (now - session.createdAt > maxAge) {
      console.log(`Cleaning up expired upload session: ${key}`);
      uploadSessions.delete(key);
    }
  }
}, 5 * 60 * 1000); // Run every 5 minutes
