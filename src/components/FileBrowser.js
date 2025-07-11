import { useState, useEffect } from 'react';
import DicomThumbnail from './DicomThumbnail';

export default function FileBrowser({ currentFile, onFileSelect, onClose, patientId, isAdmin }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [studyInfo, setStudyInfo] = useState(null);

  useEffect(() => {
    fetchFiles();
  }, [currentFile]); // Refetch when current file changes

  const fetchFiles = async () => {
    if (!currentFile) {
      setError('No current file specified');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      // Use the new study-based API that filters files by the same study as currentFile
      const apiPath = isAdmin
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/admin/study-files/${encodeURIComponent(currentFile)}`
        : `${process.env.NEXT_PUBLIC_APP_URL}/api/study-files/${encodeURIComponent(currentFile)}`;

      const token = isAdmin
        ? `Bearer ${localStorage.getItem('admin-auth-token')}`
        : `Bearer ${localStorage.getItem('auth-token')}`;

      console.log('Fetching study files for:', currentFile);

      const response = await fetch(apiPath, {
        headers: {
          'Authorization': token
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch study files');
      }

      const data = await response.json();
      setFiles(data.files || []);
      setStudyInfo({
        studyUID: data.studyUID,
        totalFiles: data.totalFiles
      });

      console.log(`Loaded ${data.files?.length || 0} files from study ${data.studyUID}`);
    } catch (err) {
      console.error('Error fetching study files:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="file-browser">
      <div className="file-browser-header">
        <h3>📁 Study Files</h3>
        {studyInfo && (
          <div className="study-info">
            <small>{studyInfo.totalFiles} files in this study</small>
          </div>
        )}
        <button className="close-btn" onClick={onClose} title="Close file browser">
          ✕
        </button>
      </div>

      <div className="file-list">
        {loading && <div className="loading">Loading files...</div>}

        {error && (
          <div className="error">
            <p>Error: {error}</p>
            <button onClick={fetchFiles}>Retry</button>
          </div>
        )}

        {!loading && !error && files.length === 0 && (
          <div className="empty">No files found in this study</div>
        )}

        {!loading && !error && files.map((file, index) => (
          <div
            key={index}
            className={`file-item ${file.name === currentFile ? 'active' : ''}`}
            onClick={() => onFileSelect(file.name)}
            title={`Click to view ${file.name}`}
          >
            {/* <div className="file-thumbnail">
              <DicomThumbnail filename={file.name} size={120} />
            </div> */}
            <div className="file-info">
              <div className="file-name">{file.name}</div>
              <div className="file-size">{file.size ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : ''}</div>
            </div>
            {file.name === currentFile && (
              <div className="current-indicator">👁️</div>
            )}
          </div>
        ))}
      </div>


    </div>
  );
}
