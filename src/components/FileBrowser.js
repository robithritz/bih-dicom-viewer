import { useState, useEffect } from 'react';
import DicomThumbnail from './DicomThumbnail';

export default function FileBrowser({ currentFile, onFileSelect, onClose, patientId, isAdmin }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      setLoading(true);
      const apiPath = isAdmin
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/admin/files?patient=${patientId}`
        : `${process.env.NEXT_PUBLIC_APP_URL}/api/files`;

      const token = isAdmin
        ? `Bearer ${localStorage.getItem('admin-auth-token')}`
        : `Bearer ${localStorage.getItem('auth-token')}`;
      const response = await fetch(apiPath,
        {
          headers: {
            'Authorization': token
          }
        }
      );
      if (!response.ok) {
        throw new Error('Failed to fetch files');
      }
      const data = await response.json();
      setFiles(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="file-browser">
      <div className="file-browser-header">
        <h3>📁 DICOM Files</h3>
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
          <div className="empty">No DICOM files found</div>
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
