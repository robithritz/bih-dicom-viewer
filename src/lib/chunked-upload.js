// Web Crypto API is available in browsers

/**
 * Configuration for chunked uploads
 */
export const CHUNK_CONFIG = {
  CHUNK_SIZE: 5 * 1024 * 1024, // 5MB per chunk
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // 1 second
  MAX_CONCURRENT_UPLOADS: 3
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
export function createFileChunks(file, chunkSize = CHUNK_CONFIG.CHUNK_SIZE) {
  const chunks = [];
  const totalChunks = Math.ceil(file.size / chunkSize);

  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end);

    chunks.push({
      index: i,
      chunk: chunk,
      size: chunk.size,
      start: start,
      end: end
    });
  }

  return chunks;
}

/**
 * Upload a single chunk with retry logic
 * @param {Object} chunkData - Chunk data
 * @param {string} patientId - Patient ID
 * @param {string} filename - Original filename
 * @param {string} fileHash - File hash
 * @param {number} totalChunks - Total number of chunks
 * @param {number} totalSize - Total file size
 * @param {Function} onProgress - Progress callback
 * @returns {Promise} - Upload result
 */
async function uploadChunk(chunkData, patientId, filename, fileHash, totalChunks, totalSize, onProgress) {
  const { index, chunk } = chunkData;
  let retries = 0;

  while (retries <= CHUNK_CONFIG.MAX_RETRIES) {
    try {
      const formData = new FormData();
      formData.append('patientId', patientId);
      formData.append('filename', filename);
      formData.append('chunkIndex', index.toString());
      formData.append('totalChunks', totalChunks.toString());
      formData.append('fileHash', fileHash);
      formData.append('totalSize', totalSize.toString());
      formData.append('chunk', chunk);

      const response = await fetch('/api/upload-chunk', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      const result = await response.json();

      // Call progress callback
      if (onProgress) {
        onProgress({
          chunkIndex: index,
          totalChunks: totalChunks,
          filename: filename,
          progress: result.progress,
          completed: result.progress && result.progress.received === totalChunks
        });
      }

      return result;

    } catch (error) {
      retries++;
      console.error(`Chunk ${index} upload attempt ${retries} failed:`, error.message);

      if (retries > CHUNK_CONFIG.MAX_RETRIES) {
        throw new Error(`Failed to upload chunk ${index} after ${CHUNK_CONFIG.MAX_RETRIES} retries: ${error.message}`);
      }

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, CHUNK_CONFIG.RETRY_DELAY * retries));
    }
  }
}

/**
 * Upload file using chunked upload with concurrent chunk processing
 * @param {File} file - File to upload
 * @param {string} patientId - Patient ID
 * @param {Function} onProgress - Progress callback
 * @returns {Promise} - Upload result
 */
export async function uploadFileChunked(file, patientId, onProgress) {
  try {
    // Calculate file hash
    const fileHash = await calculateFileHash(file);

    // Create chunks
    const chunks = createFileChunks(file);
    const totalChunks = chunks.length;

    console.log(`Uploading ${file.name} in ${totalChunks} chunks (${file.size} bytes)`);

    // Track progress
    let completedChunks = 0;
    const results = [];

    // Upload chunks with concurrency control
    const uploadPromises = [];
    let currentIndex = 0;

    const uploadNextBatch = async () => {
      const batch = [];

      // Create batch of concurrent uploads
      for (let i = 0; i < CHUNK_CONFIG.MAX_CONCURRENT_UPLOADS && currentIndex < chunks.length; i++) {
        const chunkData = chunks[currentIndex];
        currentIndex++;

        const uploadPromise = uploadChunk(
          chunkData,
          patientId,
          file.name,
          fileHash,
          totalChunks,
          file.size,
          (progressData) => {
            completedChunks++;

            // Call main progress callback
            if (onProgress) {
              onProgress({
                filename: file.name,
                completedChunks: completedChunks,
                totalChunks: totalChunks,
                percentage: Math.round((completedChunks / totalChunks) * 100),
                currentChunk: progressData.chunkIndex + 1,
                completed: progressData.completed
              });
            }
          }
        );

        batch.push(uploadPromise);
      }

      // Wait for batch to complete
      const batchResults = await Promise.all(batch);
      results.push(...batchResults);

      // Continue with next batch if there are more chunks
      if (currentIndex < chunks.length) {
        await uploadNextBatch();
      }
    };

    // Start uploading
    await uploadNextBatch();

    // Return the final result (last chunk response contains completion info)
    const finalResult = results[results.length - 1];

    return {
      success: true,
      filename: finalResult.filename || file.name,
      originalFilename: file.name,
      size: file.size,
      chunks: totalChunks,
      patientId: patientId
    };

  } catch (error) {
    console.error('Chunked upload failed:', error);
    throw error;
  }
}

/**
 * Upload multiple files using chunked upload
 * @param {Array<File>} files - Files to upload
 * @param {string} patientId - Patient ID
 * @param {Function} onProgress - Progress callback
 * @returns {Promise} - Upload results
 */
export async function uploadFilesChunked(files, patientId, onProgress) {
  const results = [];
  let completedFiles = 0;

  for (const file of files) {
    try {
      const result = await uploadFileChunked(file, patientId, (fileProgress) => {
        // Call main progress callback with overall progress
        if (onProgress) {
          onProgress({
            currentFile: completedFiles + 1,
            totalFiles: files.length,
            currentFileName: file.name,
            fileProgress: fileProgress,
            overallPercentage: Math.round(((completedFiles + (fileProgress.percentage / 100)) / files.length) * 100)
          });
        }
      });

      results.push({
        filename: file.name,
        status: 'success',
        result: result
      });

      completedFiles++;

    } catch (error) {
      console.error(`Failed to upload ${file.name}:`, error);
      results.push({
        filename: file.name,
        status: 'error',
        error: error.message
      });

      completedFiles++;
    }
  }

  return {
    success: true,
    totalFiles: files.length,
    results: results,
    successCount: results.filter(r => r.status === 'success').length,
    errorCount: results.filter(r => r.status === 'error').length
  };
}
