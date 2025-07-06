/**
 * Configuration for ZIP chunked uploads
 */
export const ZIP_CHUNK_CONFIG = {
  CHUNK_SIZE: 5 * 1024 * 1024, // 5MB per chunk
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // 1 second
};

/**
 * Calculate file hash for integrity checking
 * @param {File} file - File to hash
 * @returns {Promise<string>} - SHA-256 hash
 */
export async function calculateFileHash(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const buffer = e.target.result;
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        resolve(hashHex);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file for hashing'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Split file into chunks
 * @param {File} file - File to chunk
 * @param {number} chunkSize - Size of each chunk
 * @returns {Array} - Array of chunk objects
 */
export function createFileChunks(file, chunkSize = ZIP_CHUNK_CONFIG.CHUNK_SIZE) {
  const chunks = [];
  const totalChunks = Math.ceil(file.size / chunkSize);

  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end);

    chunks.push({
      index: i,
      chunk: chunk,
      start: start,
      end: end,
      size: chunk.size
    });
  }

  return chunks;
}

/**
 * Upload a single chunk with retry logic
 * @param {Object} chunkData - Chunk data object
 * @param {string} sessionId - Upload session ID
 * @param {string} patientId - Patient ID
 * @param {string} filename - Original filename
 * @param {string} fileHash - File hash for integrity
 * @param {number} totalChunks - Total number of chunks
 * @returns {Promise<Object>} - Upload result
 */
async function uploadChunk(chunkData, sessionId, patientId, filename, fileHash, totalChunks) {
  const formData = new FormData();
  formData.append('chunk', chunkData.chunk);
  formData.append('chunkIndex', chunkData.index.toString());
  formData.append('totalChunks', totalChunks.toString());
  formData.append('sessionId', sessionId);
  formData.append('patientId', patientId);
  formData.append('filename', filename);
  formData.append('fileHash', fileHash);
  formData.append('chunkStart', chunkData.start.toString());
  formData.append('chunkEnd', chunkData.end.toString());

  const token = localStorage.getItem('admin-auth-token');
  const headers = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let lastError;
  for (let attempt = 0; attempt < ZIP_CHUNK_CONFIG.MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(process.env.APP_URL + '/api/admin/upload-zip-chunk', {
        method: 'POST',
        headers,
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      return result;

    } catch (error) {
      lastError = error;
      console.warn(`Chunk ${chunkData.index} upload attempt ${attempt + 1} failed:`, error.message);

      if (attempt < ZIP_CHUNK_CONFIG.MAX_RETRIES - 1) {
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, ZIP_CHUNK_CONFIG.RETRY_DELAY * (attempt + 1)));
      }
    }
  }

  throw new Error(`Failed to upload chunk ${chunkData.index} after ${ZIP_CHUNK_CONFIG.MAX_RETRIES} attempts: ${lastError.message}`);
}

/**
 * Upload ZIP file using chunked upload
 * @param {File} zipFile - ZIP file to upload
 * @param {string} patientId - Patient ID parsed from filename
 * @param {Function} progressCallback - Progress callback function
 * @returns {Promise<Object>} - Upload result
 */
export async function uploadZipFileChunked(zipFile, patientId, progressCallback) {
  try {
    // Generate session ID
    const sessionId = `zip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Calculate file hash
    progressCallback({ type: 'chunk', stage: 'Calculating file hash...', percentage: 0 });
    const fileHash = await calculateFileHash(zipFile);

    // Create chunks
    progressCallback({ type: 'chunk', stage: 'Preparing upload...', percentage: 5 });
    const chunks = createFileChunks(zipFile);
    const totalChunks = chunks.length;

    console.log(`Uploading ZIP file in ${totalChunks} chunks of ${ZIP_CHUNK_CONFIG.CHUNK_SIZE / 1024 / 1024}MB each`);

    // Upload chunks sequentially
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      progressCallback({
        type: 'chunk',
        currentChunk: i + 1,
        totalChunks: totalChunks,
        completedChunks: i,
        percentage: Math.round(((i + 1) / totalChunks) * 90) // Reserve 10% for extraction
      });

      await uploadChunk(chunk, sessionId, patientId, zipFile.name, fileHash, totalChunks);
    }

    // Finalize upload and trigger extraction
    progressCallback({
      type: 'extraction',
      stage: 'Finalizing upload...',
      message: 'Assembling ZIP file and starting extraction'
    });

    const token = localStorage.getItem('admin-auth-token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const finalizeResponse = await fetch(process.env.APP_URL + '/api/admin/finalize-zip-upload', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sessionId,
        patientId,
        filename: zipFile.name,
        fileHash,
        totalChunks
      })
    });

    if (!finalizeResponse.ok) {
      const errorData = await finalizeResponse.json().catch(() => ({}));
      throw new Error(errorData.error || `Finalization failed: ${finalizeResponse.statusText}`);
    }

    const result = await finalizeResponse.json();

    // Poll for extraction progress
    if (result.extractionStarted) {
      await pollExtractionProgress(sessionId, progressCallback);
    }

    // Get final result
    const statusResponse = await fetch(`${process.env.APP_URL}/api/admin/zip-upload-status?sessionId=${sessionId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!statusResponse.ok) {
      throw new Error('Failed to get final upload status');
    }

    const finalResult = await statusResponse.json();
    return finalResult;

  } catch (error) {
    console.error('ZIP upload error:', error);
    throw error;
  }
}

/**
 * Poll extraction progress
 * @param {string} sessionId - Upload session ID
 * @param {Function} progressCallback - Progress callback function
 */
async function pollExtractionProgress(sessionId, progressCallback) {
  const token = localStorage.getItem('admin-auth-token');
  const headers = { 'Authorization': `Bearer ${token}` };

  while (true) {
    try {
      const response = await fetch(`${process.env.APP_URL}/api/admin/zip-upload-status?sessionId=${sessionId}`, {
        headers
      });

      if (!response.ok) {
        throw new Error('Failed to get extraction status');
      }

      const status = await response.json();

      if (status.extractionComplete) {
        progressCallback({
          type: 'extraction',
          stage: 'Extraction completed',
          message: `Extracted ${status.dicomFilesExtracted} DICOM files`,
          filesProcessed: status.dicomFilesExtracted,
          totalFiles: status.totalFilesInZip
        });
        break;
      } else if (status.error) {
        throw new Error(status.error);
      } else {
        // Update progress
        progressCallback({
          type: 'extraction',
          stage: status.stage || 'Extracting...',
          message: status.message || 'Processing ZIP contents',
          filesProcessed: status.filesProcessed,
          totalFiles: status.totalFilesInZip
        });
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      console.error('Error polling extraction progress:', error);
      throw error;
    }
  }
}
