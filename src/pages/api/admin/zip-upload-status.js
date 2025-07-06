import { requireAdminAuth } from '../../../lib/auth-middleware';
import { ExtractionSessionManager } from '../../../lib/zip-session-manager';

/**
 * Handle ZIP upload status check
 */
async function handleZipUploadStatus(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { sessionId } = req.query;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    const session = ExtractionSessionManager.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Return current status
    res.status(200).json({
      sessionId: session.sessionId,
      patientId: session.patientId,
      stage: session.stage,
      message: session.message,
      filesProcessed: session.filesProcessed || 0,
      totalFilesInZip: session.totalFilesInZip || 0,
      dicomFilesExtracted: session.dicomFilesExtracted || 0,
      extractionComplete: session.extractionComplete || false,
      success: session.success,
      error: session.error,
      startTime: session.startTime,
      duration: Date.now() - session.startTime
    });

    // Clean up completed sessions after 5 minutes
    if (session.extractionComplete || session.error) {
      setTimeout(() => {
        ExtractionSessionManager.delete(sessionId);
      }, 5 * 60 * 1000);
    }

  } catch (error) {
    console.error('ZIP upload status error:', error);
    res.status(500).json({ error: 'Failed to get status: ' + error.message });
  }
}

export default requireAdminAuth(handleZipUploadStatus);
