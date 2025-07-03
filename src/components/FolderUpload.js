import { useState, useRef } from 'react';

export default function FolderUpload({ onUploadComplete }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
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

    try {
      const formData = new FormData();
      formData.append('patientId', patientId.trim());
      
      files.forEach((file) => {
        formData.append('files', file);
      });

      const response = await fetch('/api/upload-folder', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        setUploadProgress({
          current: result.successCount,
          total: result.totalFiles,
          success: result.successCount,
          errors: result.errorCount
        });

        // Show detailed results
        if (result.errorCount > 0) {
          const errorFiles = result.results
            .filter(r => r.status === 'error')
            .map(r => `${r.filename}: ${r.message}`)
            .join('\n');
          alert(`Upload completed with errors:\n\nSuccessful: ${result.successCount}\nFailed: ${result.errorCount}\n\nErrors:\n${errorFiles}`);
        } else {
          alert(`Successfully uploaded ${result.successCount} files for patient ${result.patientId}`);
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

      } else {
        throw new Error(result.error || 'Upload failed');
      }

    } catch (error) {
      console.error('Upload error:', error);
      alert(`Upload failed: ${error.message}`);
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadProgress(null), 3000);
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
                <p>{uploadProgress.current} of {uploadProgress.total} files processed</p>
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
