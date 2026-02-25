import { useState, useEffect } from 'react';

export default function FileBrowser({ currentFile, onFileSelect, onClose, patientId, isAdmin, isPublic = false, publicToken = null, activeSeriesIndex = null }) {
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [studyInfo, setStudyInfo] = useState(null);
  const [activeTab, setActiveTab] = useState('images');

  useEffect(() => {
    fetchFiles();
  }, [currentFile, isPublic, publicToken, isAdmin]); // Refetch when dependencies change

  const fetchFiles = async () => {
    if (!currentFile) {
      setError('No current file specified');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const base = process.env.NEXT_PUBLIC_APP_URL;
      // Use the study-based API scoped to the current file
      const apiPath = isAdmin
        ? `${base}/api/admin/study-files/${encodeURIComponent(currentFile)}`
        : (isPublic && publicToken)
          ? `${base}/api/public/study-files/${encodeURIComponent(publicToken)}/${encodeURIComponent(currentFile)}`
          : `${base}/api/study-files/${encodeURIComponent(currentFile)}`;

      console.log('Fetching study files for:', currentFile, '->', apiPath);

      const headers = {};
      if (!isPublic) {
        headers['Authorization'] = isAdmin
          ? `Bearer ${localStorage.getItem('admin-auth-token')}`
          : `Bearer ${localStorage.getItem('auth-token')}`;
      }

      const response = await fetch(apiPath, { headers });

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
        <h3>Study Series</h3>
        <div className="header-right">
          {/* {studyInfo && (
            <div className="study-info">
              <small>{studyInfo.totalSeries} series • {studyInfo.totalFiles} files</small>
            </div>
          )} */}
          <div className="toggle-group" role="tablist" aria-label="Images or Files Info">
            <span>Images</span>
            <span className="ml-2">Files Info</span>
          </div>
        </div>
        <button className="close-btn" onClick={onClose} title="Close series browser">✕</button>
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
          // Prefer local activeSeriesIndex for highlight; fallback to membership test
          const isActive = (typeof activeSeriesIndex === 'number')
            ? index === activeSeriesIndex
            : seriesItem.files.some(file => file.name === currentFile);

          return (
            <div
              key={index}
              className={`series-item ${isActive ? 'active' : ''}`}
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
            </div>
          );
        })}
      </div>

      <style jsx>{`
        .file-browser {
          position: fixed;
          top: 174px;
          left: 0;
          width: 350px;
          height: calc(100vh - 64px - 48px - 81px);
          background: #0f172a;
          border-right: 1px solid #1f2937;
          z-index: 1000;
          display: flex;
          flex-direction: column;
          box-shadow: 2px 0 10px rgba(0,0,0,0.3);
        }

        .file-browser-header {
          padding: 12px 16px;
          border-bottom: 1px solid #1f2937;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background-color: #0b1220;
        }

        .file-browser-header h3 {
          margin: 0;
          font-size: 14px;
          font-weight: bold;
          color: ##FFFFFF;
          letter-spacing: 0.02em;
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .study-info {
          color: #9ca3af;
          font-size: 12px;
        }

        .close-btn {
          background: none;
          border: none;
          font-size: 18px;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 4px;
          color: #9ca3af;
        }

        .close-btn:hover {
          background-color: #111827;
          color: #e5e7eb;
        }

        .toggle-group {
          display: inline-flex;
          overflow: hidden;
          color: #99A1AF;
        }

        .toggle-btn {
          font-size: 11px;
          color: #9ca3af;
          padding: 6px 10px;
          border: none;
          background: transparent;
          cursor: pointer;
        }

        .toggle-btn.active {
          color: #e5e7eb;
          background-color: #111827;
        }

        .file-list {
          flex: 1;
          overflow-y: auto;
          padding: 8px 0;
        }

        .loading, .error {
          text-align: center;
          padding: 20px;
          color: #9ca3af;
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
          border-bottom: 1px solid #1f2937;
          cursor: pointer;
          transition: background-color 0.2s, color 0.2s;
          background-color: #0f172a;
        }

        .series-item:hover {
          .series-info {
            background-color: #161e2bff;
          }
        }

        .series-item.active {
          border-left: none;
          .series-info {
            background-color: #155DFC;
          }
        }

        .series-info {
          flex: 1;
          min-width: 0;
          border-radius: 8px;
          background-color: #1E2939;
        }

        .series-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .series-number {
          font-weight: 500;
          color: #8EC5FF;
          font-size: 15px;
        }

        .series-file-count {
          font-size: 12px;
          color: #D1D5DC;
          background-color: #364153;
          padding: 4px 8px;
          border-radius: 8px;
          width: 80px;
          font-weight: 500;
        }

        .series-description {
          font-size: 12px;
          color: #99A1AF;
          word-break: break-word;
          line-height: 1.4;
          font-weight: 500;
        }

        .empty {
          text-align: center;
          color: #9ca3af;
          padding: 40px 20px;
          font-style: italic;
        }
      `}</style>
    </div>
  );
}
