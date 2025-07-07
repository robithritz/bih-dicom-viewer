import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import ZipUpload from '../../components/ZipUpload';
import { useAuth } from '../../contexts/AuthContext';

export default function UploadPage() {
  const router = useRouter();
  const [recentUploads, setRecentUploads] = useState([]);
  const { user, isAuthenticated, loading: authLoading, isInitialized } = useAuth();

  const handleUploadComplete = (result) => {
    // Add to recent uploads
    setRecentUploads(prev => [
      {
        patientId: result.patientId,
        timestamp: new Date().toLocaleString(),
        successCount: result.successCount,
        errorCount: result.errorCount,
        totalFiles: result.totalFiles
      },
      ...prev.slice(0, 4) // Keep only last 5 uploads
    ]);
  };

  useEffect(() => {
    console.log("Admin Upload - Auth state check:", {
      authLoading,
      isAuthenticated,
      isInitialized,
      user: user ? { role: user.role, email: user.email, id: user.id } : null,
      hasAdminToken: !!localStorage.getItem('admin-auth-token')
    });

    // Only redirect if auth is fully initialized and user is not properly authenticated
    if (isInitialized && !authLoading) {
      if (!isAuthenticated || !user || user.role !== 'superadmin') {
        console.log("Admin Upload - Redirecting to portal - auth failed:", {
          isAuthenticated,
          hasUser: !!user,
          userRole: user?.role
        });
        router.replace('/portal');
        return;
      } else {
        console.log("Admin Upload - Authentication successful, user can access upload page");
      }
    }
  }, [user, isAuthenticated, authLoading, isInitialized, router]);

  const handleViewPatient = (patientId) => {
    router.push(`/portal?patient=${patientId}`);
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
  if (!isAuthenticated || !user || user.role !== 'superadmin') {
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
    <div className="upload-page">
      <div className="upload-header">
        <h1>Upload DICOM ZIP Files</h1>
        <p>Upload ZIP files containing DICOM files organized by patient ID</p>
        <button
          className="back-button"
          onClick={() => router.push('/portal')}
        >
          ← Back to Admin Portal
        </button>
      </div>

      <ZipUpload onUploadComplete={handleUploadComplete} />

      {recentUploads.length > 0 && (
        <div className="recent-uploads">
          <h2>Recent Uploads</h2>
          <div className="uploads-list">
            {recentUploads.map((upload, index) => (
              <div key={index} className="upload-item">
                <div className="upload-info">
                  <h3>Patient: {upload.patientId}</h3>
                  <p className="upload-time">{upload.timestamp}</p>
                  <div className="upload-stats">
                    <span className="success">✅ {upload.successCount} files</span>
                    {upload.errorCount > 0 && (
                      <span className="error">❌ {upload.errorCount} failed</span>
                    )}
                  </div>
                </div>
                <button
                  className="view-button"
                  onClick={() => handleViewPatient(upload.patientId)}
                >
                  View Files
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="upload-instructions">
        <h2>Instructions</h2>
        <ol>
          <li>Name your ZIP file using format: <code>{'{patient_id}_{episode_id}.zip'}</code></li>
          <li>ZIP file should contain DICOM files (.dcm or .dicom)</li>
          <li>Drag and drop the ZIP file or click to select</li>
          <li>Patient ID will be automatically parsed from filename</li>
          <li>DICOM files will be extracted to DICOM/[patient_id]/ folder</li>
          <li>Non-DICOM files in the ZIP will be ignored</li>
          <li>Duplicate filenames will be automatically renamed</li>
        </ol>
      </div>

      <style jsx>{`
        .upload-page {
          min-height: 100vh;
          background-color: #f5f5f5;
          padding: 20px;
        }

        .upload-header {
          text-align: center;
          margin-bottom: 30px;
        }

        .upload-header h1 {
          color: #333;
          margin-bottom: 10px;
        }

        .upload-header p {
          color: #666;
          margin-bottom: 20px;
        }

        .back-button {
          background-color: #6c757d;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 5px;
          cursor: pointer;
          font-size: 14px;
          transition: background-color 0.2s;
        }

        .back-button:hover {
          background-color: #5a6268;
        }

        .recent-uploads {
          max-width: 600px;
          margin: 40px auto;
          padding: 20px;
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        }

        .recent-uploads h2 {
          margin-top: 0;
          color: #333;
          border-bottom: 2px solid #eee;
          padding-bottom: 10px;
        }

        .uploads-list {
          display: flex;
          flex-direction: column;
          gap: 15px;
        }

        .upload-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 15px;
          border: 1px solid #eee;
          border-radius: 6px;
          background-color: #fafafa;
        }

        .upload-info h3 {
          margin: 0 0 5px 0;
          color: #333;
          font-size: 16px;
        }

        .upload-time {
          margin: 0 0 8px 0;
          color: #666;
          font-size: 12px;
        }

        .upload-stats {
          display: flex;
          gap: 15px;
        }

        .upload-stats span {
          font-size: 12px;
          font-weight: 500;
        }

        .success {
          color: #28a745;
        }

        .error {
          color: #dc3545;
        }

        .view-button {
          background-color: #007bff;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          transition: background-color 0.2s;
        }

        .view-button:hover {
          background-color: #0056b3;
        }

        .upload-instructions {
          max-width: 600px;
          margin: 40px auto;
          padding: 20px;
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        }

        .upload-instructions h2 {
          margin-top: 0;
          color: #333;
          border-bottom: 2px solid #eee;
          padding-bottom: 10px;
        }

        .upload-instructions ol {
          color: #555;
          line-height: 1.6;
        }

        .upload-instructions li {
          margin-bottom: 8px;
        }

        .upload-instructions code {
          background-color: #f8f9fa;
          padding: 2px 6px;
          border-radius: 3px;
          font-family: 'Courier New', monospace;
          font-size: 13px;
          color: #e83e8c;
        }

        @media (max-width: 768px) {
          .upload-page {
            padding: 10px;
          }
          
          .upload-item {
            flex-direction: column;
            align-items: flex-start;
            gap: 10px;
          }
          
          .view-button {
            align-self: stretch;
          }
        }
      `}</style>
    </div>
  );
}
