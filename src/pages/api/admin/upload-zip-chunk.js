import formidable from 'formidable';
import fs from 'fs';
import path from 'path';
import { requireAdminAuth } from '../../../lib/auth-middleware';
import { UploadSessionManager } from '../../../lib/zip-session-manager';

// Disable body parser for file uploads
export const config = {
  api: {
    bodyParser: false,
  },
};

// Directory for temporary chunk storage
const TEMP_DIR = path.join(process.cwd(), 'temp', 'zip-chunks');

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}



/**
 * Handle ZIP chunk upload
 */
async function handleZipChunkUpload(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse form data
    const form = formidable({
      maxFileSize: 5 * 1024 * 1024, // 5MB max chunk size
      keepExtensions: true,
      uploadDir: TEMP_DIR
    });

    const [fields, files] = await form.parse(req);

    // Extract fields
    const chunkIndex = parseInt(fields.chunkIndex?.[0]);
    const totalChunks = parseInt(fields.totalChunks?.[0]);
    const sessionId = fields.sessionId?.[0];
    const patientId = fields.patientId?.[0];
    const filename = fields.filename?.[0];
    const fileHash = fields.fileHash?.[0];
    const chunkStart = parseInt(fields.chunkStart?.[0]);
    const chunkEnd = parseInt(fields.chunkEnd?.[0]);

    // Validate required fields
    if (
      isNaN(chunkIndex) ||
      isNaN(totalChunks) ||
      !sessionId ||
      !patientId ||
      !filename ||
      !fileHash
    ) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get uploaded chunk file
    const chunkFile = files.chunk?.[0];
    if (!chunkFile) {
      return res.status(400).json({ error: 'No chunk file uploaded' });
    }

    // Validate chunk file
    const chunkPath = chunkFile.filepath || chunkFile.path;
    if (!chunkPath || !fs.existsSync(chunkPath)) {
      return res.status(400).json({ error: 'Chunk file not found' });
    }

    // Initialize or get session
    let session = UploadSessionManager.get(sessionId);
    if (!session) {
      session = UploadSessionManager.create(sessionId, {
        patientId,
        filename,
        fileHash,
        totalChunks
      });
    }

    // Validate session consistency
    if (
      session.patientId !== patientId ||
      session.filename !== filename ||
      session.fileHash !== fileHash ||
      session.totalChunks !== totalChunks
    ) {
      return res.status(400).json({ error: 'Session data mismatch' });
    }

    // Create session-specific directory
    const sessionDir = path.join(TEMP_DIR, sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    // Move chunk to session directory with proper naming
    const chunkFileName = `chunk_${chunkIndex.toString().padStart(4, '0')}`;
    const finalChunkPath = path.join(sessionDir, chunkFileName);

    fs.renameSync(chunkPath, finalChunkPath);

    // Update session with chunk
    UploadSessionManager.addChunk(sessionId, chunkIndex, finalChunkPath);

    console.log(`Received chunk ${chunkIndex + 1}/${totalChunks} for session ${sessionId}`);

    // Check if all chunks are uploaded
    const isComplete = UploadSessionManager.isComplete(sessionId);

    res.status(200).json({
      success: true,
      chunkIndex,
      totalChunks,
      uploadedChunks: session.uploadedChunks.size,
      isComplete,
      sessionId
    });

  } catch (error) {
    console.error('ZIP chunk upload error:', error);
    res.status(500).json({ error: 'Failed to upload chunk: ' + error.message });
  }
}

export default requireAdminAuth(handleZipChunkUpload);
