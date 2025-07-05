import { useState, useRef } from 'react';
import { uploadFilesChunked } from '../lib/chunked-upload';

export default function FolderUpload({ onUploadComplete }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [chunkProgress, setChunkProgress] = useState(null);
  const [patientId, setPatientId] = useState('');
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

    const items = e.dataTransfer.items;
    const files = [];

    // Process dropped items
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file && (file.name.endsWith('.dcm') || file.name.endsWith('.dicom'))) {
          files.push(file);
        }
      }
    }

    if (files.length > 0) {
      handleUpload(files);
    } else {
      alert('Please drop DICOM files (.dcm or .dicom)');
    }
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files).filter(file =>
      file.name.endsWith('.dcm') || file.name.endsWith('.dicom')
    );

    if (files.length > 0) {
      handleUpload(files);
    } else {
      alert('Please select DICOM files (.dcm or .dicom)');
    }
  };

  const handleUpload = async (files) => {
    if (!patientId.trim()) {
      alert('Please enter a Patient ID');
      return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(patientId.trim())) {
      alert('Patient ID can only contain letters, numbers, hyphens, and underscores');
      return;
    }

    setIsUploading(true);
    setUploadProgress({ current: 0, total: files.length });
    setChunkProgress(null);

    try {
      // Calculate total size for progress tracking
      const totalSize = files.reduce((sum, file) => sum + file.size, 0);
      console.log(`Starting chunked upload of ${files.length} files (${(totalSize / 1024 / 1024).toFixed(2)} MB total)`);

      const result = await uploadFilesChunked(files, patientId.trim(), (progress) => {
        // Update overall progress
        setUploadProgress({
          current: progress.currentFile - 1,
          total: progress.totalFiles,
          currentFile: progress.currentFile,
          currentFileName: progress.currentFileName,
          overallPercentage: progress.overallPercentage
        });

        // Update chunk progress for current file
        if (progress.fileProgress) {
          setChunkProgress({
            filename: progress.currentFileName,
            chunksCompleted: progress.fileProgress.completedChunks,
            totalChunks: progress.fileProgress.totalChunks,
            percentage: progress.fileProgress.percentage,
            currentChunk: progress.fileProgress.currentChunk
          });
        }
      });

      // Final progress update
      setUploadProgress({
        current: result.successCount,
        total: result.totalFiles,
        success: result.successCount,
        errors: result.errorCount,
        completed: true
      });
      setChunkProgress(null);

      // Show detailed results
      if (result.errorCount > 0) {
        const errorFiles = result.results
          .filter(r => r.status === 'error')
          .map(r => `${r.filename}: ${r.error}`)
          .join('\n');
        alert(`Upload completed with errors:\n\nSuccessful: ${result.successCount}\nFailed: ${result.errorCount}\n\nErrors:\n${errorFiles}`);
      } else {
        alert(`Successfully uploaded ${result.successCount} files for patient ${patientId.trim()}`);
      }

      // Reset form
      setPatientId('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      // Notify parent component
      if (onUploadComplete) {
        onUploadComplete(result);
      }

    } catch (error) {
      console.error('Chunked upload error:', error);
      alert(`Upload failed: ${error.message}`);
    } finally {
      setIsUploading(false);
      setTimeout(() => {
        setUploadProgress(null);
        setChunkProgress(null);
      }, 3000);
    }
  };

  return (
    <div className="folder-upload">
      <div className="upload-form">
        <div className="patient-id-input">
          <label htmlFor="patientId">Patient ID:</label>
          <input
            type="text"
            id="patientId"
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            placeholder="Enter patient ID (e.g., PATIENT_001)"
            disabled={isUploading}
            pattern="[a-zA-Z0-9_-]+"
            title="Only letters, numbers, hyphens, and underscores allowed"
          />
        </div>

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
            multiple
            accept=".dcm,.dicom"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            disabled={isUploading}
          />

          {isUploading ? (
            <div className="upload-status">
              <div className="spinner"></div>
              <p>Uploading files...</p>
              {uploadProgress && (
                <div className="progress-details">
                  <p>File {uploadProgress.currentFile || uploadProgress.current} of {uploadProgress.total}</p>
                  {uploadProgress.currentFileName && (
                    <p className="current-file">📄 {uploadProgress.currentFileName}</p>
                  )}
                  {uploadProgress.overallPercentage && (
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${uploadProgress.overallPercentage}%` }}
                      ></div>
                      <span className="progress-text">{uploadProgress.overallPercentage}%</span>
                    </div>
                  )}
                </div>
              )}
              {chunkProgress && (
                <div className="chunk-progress">
                  <p className="chunk-info">
                    Chunk {chunkProgress.currentChunk || chunkProgress.chunksCompleted} of {chunkProgress.totalChunks}
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
            </div>
          ) : (
            <div className="drop-zone-content">
              <div className="upload-icon">📁</div>
              <h3>Drop DICOM files here</h3>
              <p>or click to select files</p>
              <small>Supported formats: .dcm, .dicom</small>
            </div>
          )}
        </div>

        {uploadProgress && !isUploading && (
          <div className="upload-results">
            <p>✅ Upload completed!</p>
            <p>Successfully uploaded: {uploadProgress.success} files</p>
            {uploadProgress.errors > 0 && (
              <p>❌ Failed: {uploadProgress.errors} files</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
