import { useState, useEffect } from 'react';

export default function FileBrowser({ currentFile, onFileSelect, onClose, patientId, isAdmin }) {
  const [series, setSeries] = useState([]);
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
      setSeries(data.series || []);
      setStudyInfo({
        studyUID: data.studyUID,
        totalFiles: data.totalFiles,
        totalSeries: data.totalSeries
      });

      console.log(`Loaded ${data.series?.length || 0} series from study ${data.studyUID}`);
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
        <h3>📊 Study Series</h3>
        {studyInfo && (
          <div className="study-info">
            <small>{studyInfo.totalSeries} series • {studyInfo.totalFiles} total files</small>
          </div>
        )}
        <button className="close-btn" onClick={onClose} title="Close series browser">
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

        {!loading && !error && series.length === 0 && (
          <div className="empty">No series found in this study</div>
        )}

        {!loading && !error && series.map((seriesItem, index) => {
          // Check if current file is in this series
          const isCurrentSeries = seriesItem.files.some(file => file.name === currentFile);

          return (
            <div
              key={index}
              className={`series-item ${isCurrentSeries ? 'active' : ''}`}
              onClick={() => {
                // Navigate to first file in the series
                const firstFile = seriesItem.files[0];
                if (firstFile) {
                  onFileSelect(firstFile.name);
                }
              }}
              title={`Click to view ${seriesItem.seriesDescription}`}
            >
              <div className="series-info">
                <div className="series-header">
                  <div className="series-number">Series {seriesItem.seriesNumber}</div>
                  <div className="series-file-count">{seriesItem.files.length} files</div>
                </div>
                <div className="series-description">
                  {seriesItem.seriesDescription || `Series ${seriesItem.seriesNumber}`}
                </div>
              </div>
              {isCurrentSeries && (
                <div className="current-indicator">👁️</div>
              )}
            </div>
          );
        })}
      </div>

      <style jsx>{`
        .file-browser {
          position: fixed;
          top: 0;
          left: 0;
          width: 350px;
          height: 100vh;
          background: white;
          border-right: 1px solid #ddd;
          z-index: 1000;
          display: flex;
          flex-direction: column;
          box-shadow: 2px 0 10px rgba(0,0,0,0.1);
        }

        .file-browser-header {
          padding: 16px;
          border-bottom: 1px solid #eee;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background-color: #f8f9fa;
        }

        .file-browser-header h3 {
          margin: 0;
          font-size: 16px;
          color: #333;
        }

        .study-info {
          color: #666;
          font-size: 12px;
        }

        .close-btn {
          background: none;
          border: none;
          font-size: 18px;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 4px;
          color: #666;
        }

        .close-btn:hover {
          background-color: #f0f0f0;
          color: #333;
        }

        .file-list {
          flex: 1;
          overflow-y: auto;
          padding: 8px 0;
        }

        .loading, .error {
          text-align: center;
          padding: 20px;
          color: #666;
        }

        .error button {
          margin-top: 8px;
          padding: 6px 12px;
          background-color: #2196f3;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }

        .series-item {
          display: flex;
          align-items: center;
          padding: 16px;
          border-bottom: 1px solid #eee;
          cursor: pointer;
          transition: background-color 0.2s;
        }

        .series-item:hover {
          background-color: #f0f0f0;
        }

        .series-item.active {
          background-color: #e3f2fd;
          border-left: 4px solid #2196f3;
        }

        .series-info {
          flex: 1;
          min-width: 0;
        }

        .series-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .series-number {
          font-weight: 700;
          color: #1976d2;
          font-size: 16px;
        }

        .series-file-count {
          font-size: 12px;
          color: #666;
          background-color: #f0f0f0;
          padding: 4px 8px;
          border-radius: 12px;
          font-weight: 500;
        }

        .series-description {
          font-size: 14px;
          color: #333;
          word-break: break-word;
          line-height: 1.4;
          font-weight: 500;
        }

        .current-indicator {
          font-size: 18px;
          margin-left: 8px;
          flex-shrink: 0;
        }

        .empty {
          text-align: center;
          color: #666;
          padding: 40px 20px;
          font-style: italic;
        }
      `}</style>
    </div>
  );
}
