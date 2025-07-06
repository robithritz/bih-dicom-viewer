/**
 * Shared session manager for ZIP upload and extraction
 * Uses file system for persistence across API endpoints
 * In production, this should be replaced with Redis or another persistent store
 */

import fs from 'fs';
import path from 'path';

const SESSIONS_DIR = path.join(process.cwd(), 'temp', 'sessions');

// Ensure sessions directory exists
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

/**
 * Helper functions for file-based session storage
 */
function getUploadSessionPath(sessionId) {
  return path.join(SESSIONS_DIR, `upload_${sessionId}.json`);
}

function getExtractionSessionPath(sessionId) {
  return path.join(SESSIONS_DIR, `extraction_${sessionId}.json`);
}

function saveUploadSession(sessionId, session) {
  const sessionPath = getUploadSessionPath(sessionId);
  // Convert Set and Map to arrays for JSON serialization
  const serializable = {
    ...session,
    uploadedChunks: Array.from(session.uploadedChunks || []),
    chunkPaths: Array.from(session.chunkPaths?.entries() || [])
  };
  fs.writeFileSync(sessionPath, JSON.stringify(serializable, null, 2));
}

function loadUploadSession(sessionId) {
  const sessionPath = getUploadSessionPath(sessionId);
  if (!fs.existsSync(sessionPath)) return null;

  try {
    const data = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
    // Convert arrays back to Set and Map
    return {
      ...data,
      uploadedChunks: new Set(data.uploadedChunks || []),
      chunkPaths: new Map(data.chunkPaths || [])
    };
  } catch (error) {
    console.error('Error loading upload session:', error);
    return null;
  }
}

function saveExtractionSession(sessionId, session) {
  const sessionPath = getExtractionSessionPath(sessionId);
  fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));
}

function loadExtractionSession(sessionId) {
  const sessionPath = getExtractionSessionPath(sessionId);
  if (!fs.existsSync(sessionPath)) return null;

  try {
    return JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
  } catch (error) {
    console.error('Error loading extraction session:', error);
    return null;
  }
}

/**
 * Upload session management
 */
export const UploadSessionManager = {
  create(sessionId, data) {
    const session = {
      sessionId,
      ...data,
      uploadedChunks: new Set(),
      chunkPaths: new Map(),
      startTime: Date.now()
    };
    saveUploadSession(sessionId, session);
    return session;
  },

  get(sessionId) {
    return loadUploadSession(sessionId);
  },

  update(sessionId, updates) {
    const session = loadUploadSession(sessionId);
    if (session) {
      Object.assign(session, updates);
      saveUploadSession(sessionId, session);
    }
    return session;
  },

  delete(sessionId) {
    const sessionPath = getUploadSessionPath(sessionId);
    if (fs.existsSync(sessionPath)) {
      fs.unlinkSync(sessionPath);
      return true;
    }
    return false;
  },

  addChunk(sessionId, chunkIndex, chunkPath) {
    const session = loadUploadSession(sessionId);
    if (session) {
      session.uploadedChunks.add(chunkIndex);
      session.chunkPaths.set(chunkIndex, chunkPath);
      saveUploadSession(sessionId, session);
    }
    return session;
  },

  isComplete(sessionId) {
    const session = loadUploadSession(sessionId);
    return session && session.uploadedChunks.size === session.totalChunks;
  }
};

/**
 * Extraction session management
 */
export const ExtractionSessionManager = {
  create(sessionId, data) {
    const session = {
      sessionId,
      ...data,
      filesProcessed: 0,
      totalFilesInZip: 0,
      dicomFilesExtracted: 0,
      extractionComplete: false,
      success: false,
      startTime: Date.now()
    };
    saveExtractionSession(sessionId, session);
    return session;
  },

  get(sessionId) {
    return loadExtractionSession(sessionId);
  },

  update(sessionId, updates) {
    const session = loadExtractionSession(sessionId);
    if (session) {
      Object.assign(session, updates);
      saveExtractionSession(sessionId, session);
    }
    return session;
  },

  delete(sessionId) {
    const sessionPath = getExtractionSessionPath(sessionId);
    if (fs.existsSync(sessionPath)) {
      fs.unlinkSync(sessionPath);
      return true;
    }
    return false;
  },

  setError(sessionId, error) {
    const session = loadExtractionSession(sessionId);
    if (session) {
      session.error = error;
      session.success = false;
      saveExtractionSession(sessionId, session);
    }
    return session;
  },

  setComplete(sessionId, result) {
    const session = loadExtractionSession(sessionId);
    if (session) {
      session.extractionComplete = true;
      session.success = true;
      session.dicomFilesExtracted = result.dicomFilesExtracted;
      session.totalFilesInZip = result.totalFilesInZip;
      saveExtractionSession(sessionId, session);
    }
    return session;
  },

  // Clean up old sessions (call periodically)
  cleanup(maxAge = 30 * 60 * 1000) { // 30 minutes default
    const now = Date.now();
    if (!fs.existsSync(SESSIONS_DIR)) return;

    const files = fs.readdirSync(SESSIONS_DIR);
    for (const file of files) {
      if (file.startsWith('extraction_')) {
        const filePath = path.join(SESSIONS_DIR, file);
        try {
          const session = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          if (now - session.startTime > maxAge) {
            fs.unlinkSync(filePath);
          }
        } catch (error) {
          // Remove corrupted session files
          fs.unlinkSync(filePath);
        }
      }
    }
  }
};

// Periodic cleanup
setInterval(() => {
  ExtractionSessionManager.cleanup();
}, 5 * 60 * 1000); // Clean up every 5 minutes
