import { useState, useRef } from 'react';
import { uploadZipFileChunked } from '../lib/zip-upload';

export default function ZipUpload({ onUploadComplete }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [chunkProgress, setChunkProgress] = useState(null);
  const [extractionProgress, setExtractionProgress] = useState(null);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const zipFiles = files.filter(file => file.name.endsWith('.zip'));

    if (zipFiles.length === 1) {
      handleUpload(zipFiles[0]);
    } else if (zipFiles.length === 0) {
      alert('Please drop a ZIP file containing DICOM files');
    } else {
      alert('Please drop only one ZIP file at a time');
    }
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    const zipFiles = files.filter(file => file.name.endsWith('.zip'));

    if (zipFiles.length === 1) {
      handleUpload(zipFiles[0]);
    } else if (zipFiles.length === 0) {
      alert('Please select a ZIP file containing DICOM files');
    } else {
      alert('Please select only one ZIP file at a time');
    }
  };

  const parsePatientIdFromFilename = (filename) => {
    // Extract patient ID from filename format: {patient_id}_{episode_id}.zip
    const nameWithoutExt = filename.replace('.zip', '');
    const parts = nameWithoutExt.split('_');

    if (parts.length >= 2) {
      // Return patient_id (first part before underscore)
      return parts[0];
    } else {
      // If no underscore, use the whole filename as patient ID
      return nameWithoutExt;
    }
  };

  const handleUpload = async (zipFile) => {
    // Parse patient ID from filename
    const patientId = parsePatientIdFromFilename(zipFile.name);

    if (!patientId) {
      alert('Could not parse patient ID from filename. Please use format: {patient_id}_{episode_id}.zip');
      return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(patientId)) {
      alert(`Invalid patient ID "${patientId}". Patient ID can only contain letters, numbers, hyphens, and underscores`);
      return;
    }

    setIsUploading(true);
    setUploadProgress({ filename: zipFile.name, size: zipFile.size, patientId });
    setChunkProgress(null);
    setExtractionProgress(null);

    try {
      console.log(`Starting ZIP upload: ${zipFile.name} (${(zipFile.size / 1024 / 1024).toFixed(2)} MB) for patient ${patientId}`);

      const result = await uploadZipFileChunked(zipFile, patientId, (progress) => {
        if (progress.type === 'chunk') {
          // Update chunk progress
          setChunkProgress({
            filename: zipFile.name,
            chunksCompleted: progress.completedChunks,
            totalChunks: progress.totalChunks,
            percentage: progress.percentage,
            currentChunk: progress.currentChunk
          });
        } else if (progress.type === 'extraction') {
          // Update extraction progress
          setExtractionProgress({
            stage: progress.stage,
            message: progress.message,
            filesProcessed: progress.filesProcessed,
            totalFiles: progress.totalFiles
          });
          setChunkProgress(null); // Hide chunk progress during extraction
        }
      });

      // Final progress update
      setUploadProgress({
        filename: zipFile.name,
        patientId,
        completed: true,
        success: result.success,
        dicomFilesExtracted: result.dicomFilesExtracted,
        totalFilesInZip: result.totalFilesInZip
      });
      setChunkProgress(null);
      setExtractionProgress(null);

      // Show results
      if (result.success) {
        alert(`Successfully processed ${zipFile.name}!\n\nExtracted ${result.dicomFilesExtracted} DICOM files to patient folder: ${patientId}\nTotal files in ZIP: ${result.totalFilesInZip}`);
      } else {
        alert(`Upload failed: ${result.error}`);
      }

      // Reset form
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      // Notify parent component
      if (onUploadComplete) {
        onUploadComplete({
          patientId,
          successCount: result.dicomFilesExtracted,
          totalFiles: result.totalFilesInZip,
          errorCount: result.totalFilesInZip - result.dicomFilesExtracted
        });
      }

    } catch (error) {
      console.error('ZIP upload error:', error);
      alert(`Upload failed: ${error.message}`);
    } finally {
      setIsUploading(false);
      setTimeout(() => {
        setUploadProgress(null);
        setChunkProgress(null);
        setExtractionProgress(null);
      }, 3000);
    }
  };

  return (
    <div className="zip-upload">
      <div className="upload-form">
        <div
          className={`drop-zone ${isDragging ? 'dragging' : ''} ${isUploading ? 'uploading' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !isUploading && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            disabled={isUploading}
          />

          {isUploading ? (
            <div className="upload-status">
              <div className="spinner"></div>
              <p>Processing ZIP file...</p>
              {uploadProgress && (
                <div className="progress-details">
                  <p>📦 {uploadProgress.filename}</p>
                  <p>👤 Patient ID: {uploadProgress.patientId}</p>
                  <p>📊 Size: {(uploadProgress.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              )}
              {chunkProgress && (
                <div className="chunk-progress">
                  <p className="chunk-info">
                    Uploading chunk {chunkProgress.currentChunk || chunkProgress.chunksCompleted} of {chunkProgress.totalChunks}
                  </p>
                  <div className="chunk-progress-bar">
                    <div
                      className="chunk-progress-fill"
                      style={{ width: `${chunkProgress.percentage}%` }}
                    ></div>
                    <span className="chunk-progress-text">{chunkProgress.percentage}%</span>
                  </div>
                </div>
              )}
              {extractionProgress && (
                <div className="extraction-progress">
                  <p className="extraction-stage">🔄 {extractionProgress.stage}</p>
                  <p className="extraction-message">{extractionProgress.message}</p>
                  {extractionProgress.filesProcessed !== undefined && (
                    <p>Files processed: {extractionProgress.filesProcessed} / {extractionProgress.totalFiles}</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="drop-zone-content">
              <div className="upload-icon">📦</div>
              <h3>Drop ZIP file here</h3>
              <p>or click to select ZIP file</p>
              <small>Format: {'{URN}_{episode_id}.zip'}</small>
              <small>Contains DICOM files (.dcm)</small>
            </div>
          )}
        </div>

        {uploadProgress && !isUploading && (
          <div className="upload-results">
            <p>✅ ZIP processing completed!</p>
            <p>Patient ID: {uploadProgress.patientId}</p>
            <p>DICOM files extracted: {uploadProgress.dicomFilesExtracted}</p>
            <p>Total files in ZIP: {uploadProgress.totalFilesInZip}</p>
          </div>
        )}
      </div>

      <style jsx>{`
        .zip-upload {
          max-width: 600px;
          margin: 0 auto;
        }

        .drop-zone {
          border: 2px dashed #ccc;
          border-radius: 10px;
          padding: 40px;
          text-align: center;
          cursor: pointer;
          transition: all 0.3s ease;
          background-color: #fafafa;
          min-height: 200px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .drop-zone:hover {
          border-color: #007bff;
          background-color: #f0f8ff;
        }

        .drop-zone.dragging {
          border-color: #007bff;
          background-color: #e3f2fd;
          transform: scale(1.02);
        }

        .drop-zone.uploading {
          border-color: #28a745;
          background-color: #f8fff8;
          cursor: not-allowed;
        }

        .upload-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }

        .drop-zone-content h3 {
          margin: 0 0 8px 0;
          color: #333;
          font-size: 18px;
        }

        .drop-zone-content p {
          margin: 0 0 8px 0;
          color: #666;
          font-size: 14px;
        }

        .drop-zone-content small {
          display: block;
          color: #888;
          font-size: 12px;
          margin-top: 4px;
        }

        .upload-status {
          text-align: center;
        }

        .spinner {
          border: 3px solid #f3f3f3;
          border-top: 3px solid #007bff;
          border-radius: 50%;
          width: 30px;
          height: 30px;
          animation: spin 1s linear infinite;
          margin: 0 auto 16px;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .progress-details p {
          margin: 4px 0;
          font-size: 14px;
          color: #555;
        }

        .chunk-progress, .extraction-progress {
          margin-top: 16px;
          padding: 12px;
          background-color: rgba(0, 123, 255, 0.1);
          border-radius: 6px;
        }

        .chunk-progress-bar, .progress-bar {
          position: relative;
          background-color: #e9ecef;
          border-radius: 4px;
          height: 20px;
          margin-top: 8px;
          overflow: hidden;
        }

        .chunk-progress-fill, .progress-fill {
          background-color: #007bff;
          height: 100%;
          transition: width 0.3s ease;
        }

        .chunk-progress-text, .progress-text {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 12px;
          font-weight: bold;
          color: white;
          text-shadow: 1px 1px 1px rgba(0,0,0,0.5);
        }

        .extraction-stage {
          font-weight: bold;
          color: #007bff;
        }

        .extraction-message {
          font-style: italic;
          color: #666;
        }

        .upload-results {
          margin-top: 20px;
          padding: 16px;
          background-color: #d4edda;
          border: 1px solid #c3e6cb;
          border-radius: 6px;
          color: #155724;
        }

        .upload-results p {
          margin: 4px 0;
        }
      `}</style>
    </div>
  );
}
