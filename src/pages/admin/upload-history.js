import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../../components/Layout';
import { useAuth } from '../../contexts/AuthContext';

export default function UploadHistoryPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading, isInitialized } = useAuth();
  const [uploadHistory, setUploadHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deletingFolder, setDeletingFolder] = useState(null);

  useEffect(() => {
    console.log("Upload History - Auth state check:", {
      authLoading,
      isAuthenticated,
      isInitialized,
      user: user ? { role: user.role, email: user.email, id: user.id } : null,
      hasAdminToken: !!localStorage.getItem('admin-auth-token')
    });

    // Only redirect if auth is fully initialized and user is not properly authenticated
    if (isInitialized && !authLoading) {
      if (!isAuthenticated || !user || user.role !== 'dicomadmin') {
        console.log("Upload History - Redirecting to portal - auth failed:", {
          isAuthenticated,
          hasUser: !!user,
          userRole: user?.role
        });
        router.replace('/portal');
        return;
      } else {
        console.log("Upload History - Authentication successful, user can access upload history page");
        fetchUploadHistory();
      }
    }
  }, [user, isAuthenticated, authLoading, isInitialized, router]);

  const fetchUploadHistory = async () => {
    try {
      setLoading(true);
      setError(null);

      const token = localStorage.getItem('admin-auth-token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/admin/upload-history`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch upload history');
      }

      const data = await response.json();
      setUploadHistory(data.uploadHistory || []);
    } catch (err) {
      console.error('❌ fetchUploadHistory error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFolder = async (folderName) => {
    if (!confirm(`Are you sure you want to delete the folder "${folderName}"? This will permanently delete all DICOM files in this folder and mark all related studies as inactive.`)) {
      return;
    }

    try {
      setDeletingFolder(folderName);
      setError(null);

      const token = localStorage.getItem('admin-auth-token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/admin/delete-upload-folder`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ folderName })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete folder');
      }

      const data = await response.json();
      alert(data.message);

      // Refresh the upload history
      await fetchUploadHistory();
    } catch (err) {
      console.error('❌ handleDeleteFolder error:', err);
      setError(err.message);
      alert(`Error deleting folder: ${err.message}`);
    } finally {
      setDeletingFolder(null);
    }
  };

  // Show loading while auth is initializing
  if (!isInitialized || authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Initializing authentication...</p>
        </div>
      </div>
    );
  }

  // Show loading if user is not authenticated (will redirect)
  if (!isAuthenticated || !user || user.role !== 'dicomadmin') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Checking permissions...</p>
        </div>
      </div>
    );
  }

  return (
    <Layout>
      <div className="upload-history-page">
        <div className="upload-history-header">
          <h1>Upload History</h1>
          <p>View and manage uploaded DICOM folders</p>
          <div className="header-actions">
            <Link href="/portal" className="back-button">
              ← Back to Admin Portal
            </Link>
            <Link href="/admin/upload" className="upload-button">
              📁 Upload New Files
            </Link>
          </div>
        </div>

        {error && (
          <div className="error-message">
            <p>❌ {error}</p>
          </div>
        )}

        {loading ? (
          <div className="loading-container">
            <div className="loading-spinner">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
            <p>Loading upload history...</p>
          </div>
        ) : uploadHistory.length === 0 ? (
          <div className="no-history">
            <h2>No Upload History Found</h2>
            <p>No DICOM folders have been uploaded yet.</p>
            <Link href="/admin/upload" className="upload-link">
              📁 Upload Your First Files
            </Link>
          </div>
        ) : (
          <div className="history-list">
            {uploadHistory.map((folder) => (
              <div key={folder.folderName} className="history-item">
                <div className="folder-info">
                  <h3 className="folder-name">{folder.folderName}</h3>
                  <div className="folder-stats">
                    <span className="stat">
                      <strong>Studies:</strong> {folder.studyCount}
                    </span>
                    <span className="stat">
                      <strong>Total Files:</strong> {folder.totalFiles}
                    </span>
                    <span className="stat">
                      <strong>Patient ID:</strong> {folder.patientId}
                    </span>
                    <span className="stat">
                      <strong>Uploaded:</strong> {new Date(folder.createdAt).toLocaleString()}
                    </span>
                    <span className="stat">
                      <strong>Uploaded by:</strong> {folder.studies[0]?.uploadedBy || 'Unknown'}
                    </span>
                  </div>
                  <div className="folder-studies">
                    <h4>Studies in this folder:</h4>
                    <ul>
                      {folder.studies.map((study) => (
                        <li key={study.id} className={!study.active ? 'inactive-study' : ''}>
                          <span className="study-name">
                            {study.patientName || 'Unknown Patient'} - {study.studyDescription || 'No Description'}
                          </span>
                          <span className="study-date">
                            {study.studyDate ? new Date(study.studyDate.substring(0, 4) + "-" + study.studyDate.substring(4, 6) + "-" + study.studyDate.substring(6, 8)).toLocaleDateString() : 'No Date'}
                          </span>
                          <span className="study-modality">{study.modality || 'N/A'}</span>
                          {!study.active && <span className="inactive-badge">Inactive</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="folder-actions">
                  <button
                    onClick={() => handleDeleteFolder(folder.folderName)}
                    disabled={deletingFolder === folder.folderName}
                    className="delete-button"
                  >
                    {deletingFolder === folder.folderName ? (
                      <>
                        <div className="button-spinner"></div>
                        Deleting...
                      </>
                    ) : (
                      <>
                        🗑️ Delete Folder
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <style jsx>{`
          .upload-history-page {
            min-height: 100vh;
            background-color: #f5f5f5;
            padding: 20px;
          }

          .upload-history-header {
            text-align: center;
            margin-bottom: 30px;
          }

          .upload-history-header h1 {
            color: #333;
            margin-bottom: 10px;
            font-size: 2.5rem;
            font-weight: bold;
          }

          .upload-history-header p {
            color: #666;
            margin-bottom: 20px;
            font-size: 1.1rem;
          }

          .header-actions {
            display: flex;
            gap: 15px;
            justify-content: center;
            align-items: center;
          }

          .back-button, .upload-button {
            background-color: #6c757d;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            text-decoration: none;
            transition: background-color 0.2s;
          }

          .upload-button {
            background-color: #007bff;
          }

          .back-button:hover {
            background-color: #5a6268;
          }

          .upload-button:hover {
            background-color: #0056b3;
          }

          .error-message {
            max-width: 800px;
            margin: 20px auto;
            padding: 15px;
            background-color: #f8d7da;
            border: 1px solid #f5c6cb;
            border-radius: 5px;
            color: #721c24;
          }

          .loading-container {
            text-align: center;
            padding: 60px 20px;
          }

          .loading-spinner {
            margin-bottom: 20px;
          }

          .no-history {
            text-align: center;
            padding: 60px 20px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            max-width: 600px;
            margin: 0 auto;
          }

          .no-history h2 {
            color: #333;
            margin-bottom: 15px;
          }

          .no-history p {
            color: #666;
            margin-bottom: 20px;
          }

          .upload-link {
            background-color: #007bff;
            color: white;
            padding: 12px 24px;
            border-radius: 5px;
            text-decoration: none;
            font-weight: 500;
            transition: background-color 0.2s;
          }

          .upload-link:hover {
            background-color: #0056b3;
          }

          .history-list {
            max-width: 1200px;
            margin: 0 auto;
            display: flex;
            flex-direction: column;
            gap: 20px;
          }

          .history-item {
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            padding: 20px;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 20px;
          }

          .folder-info {
            flex: 1;
          }

          .folder-name {
            color: #333;
            margin: 0 0 15px 0;
            font-size: 1.5rem;
            font-weight: bold;
          }

          .folder-stats {
            display: flex;
            flex-wrap: wrap;
            gap: 20px;
            margin-bottom: 20px;
          }

          .stat {
            font-size: 14px;
            color: #555;
          }

          .stat strong {
            color: #333;
          }

          .folder-studies h4 {
            color: #333;
            margin: 0 0 10px 0;
            font-size: 1.1rem;
          }

          .folder-studies ul {
            list-style: none;
            padding: 0;
            margin: 0;
          }

          .folder-studies li {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 12px;
            margin-bottom: 5px;
            background-color: #f8f9fa;
            border-radius: 4px;
            font-size: 14px;
          }

          .folder-studies li.inactive-study {
            background-color: #f5f5f5;
            opacity: 0.7;
          }

          .study-name {
            flex: 1;
            color: #333;
            font-weight: 500;
          }

          .study-date {
            color: #666;
            margin: 0 10px;
            font-size: 12px;
          }

          .study-modality {
            color: #007bff;
            font-weight: 500;
            margin: 0 10px;
            font-size: 12px;
          }

          .inactive-badge {
            background-color: #dc3545;
            color: white;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 10px;
            font-weight: bold;
          }

          .folder-actions {
            display: flex;
            flex-direction: column;
            gap: 10px;
          }

          .delete-button {
            background-color: #dc3545;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: background-color 0.2s;
            display: flex;
            align-items: center;
            gap: 8px;
            min-width: 140px;
            justify-content: center;
          }

          .delete-button:hover:not(:disabled) {
            background-color: #c82333;
          }

          .delete-button:disabled {
            background-color: #6c757d;
            cursor: not-allowed;
          }

          .button-spinner {
            width: 16px;
            height: 16px;
            border: 2px solid transparent;
            border-top: 2px solid white;
            border-radius: 50%;
            animation: spin 1s linear infinite;
          }

          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }

          @media (max-width: 768px) {
            .upload-history-page {
              padding: 10px;
            }
            
            .header-actions {
              flex-direction: column;
              gap: 10px;
            }
            
            .history-item {
              flex-direction: column;
              align-items: stretch;
            }
            
            .folder-stats {
              flex-direction: column;
              gap: 8px;
            }
            
            .folder-studies li {
              flex-direction: column;
              align-items: flex-start;
              gap: 5px;
            }
            
            .delete-button {
              align-self: stretch;
            }
          }
        `}</style>
      </div>
    </Layout>
  );
}
