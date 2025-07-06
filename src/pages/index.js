import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import Image from 'next/image';

export default function PatientPortal() {
  const router = useRouter();
  const { user, logout, isAuthenticated, loading: authLoading } = useAuth();
  const [studies, setStudies] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, authLoading, router]);

  useEffect(() => {
    if (isAuthenticated && user?.patientId) {
      fetchStudies();
    }
  }, [isAuthenticated, user]);

  const fetchStudies = async () => {
    if (!user?.patientId) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/studies?patient=${user.patientId}`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth-token')}`
          }
        }
      );
      if (!response.ok) {
        throw new Error('Failed to fetch studies');
      }
      const data = await response.json();
      setStudies(data.studies);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Show loading while checking authentication
  if (authLoading) {
    return (
      <Layout>
        <div className="loading">Loading...</div>
      </Layout>
    );
  }

  // Don't render anything if not authenticated (will redirect)
  if (!isAuthenticated) {
    return null;
  }

  if (loading) {
    return (
      <Layout>
        <div className="container">
          <div className="header">
            <h1 className="flex justify-center">
              <Image src="/images/bih-logo.png" alt="Logo" width={200} height={80} />
              DICOM Viewer</h1>
            <p>Loading your medical imaging studies...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="container">
          <div className="header">
            <h1 className="flex justify-center">
              <Image src="/images/bih-logo.png" alt="Logo" width={200} height={80} />
              DICOM Viewer
            </h1>
            <p style={{ color: 'red' }}>Error: {error}</p>
            <button onClick={fetchStudies}>Retry</button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container">
        <div className="header">
          <h1 className="flex justify-center">
            <Image src="/images/bih-logo.png" alt="Logo" width={200} height={80} />
            DICOM Viewer
          </h1>
          <p>Welcome, {user?.firstName} - View your medical imaging results</p>
          <div className="header-actions">
            <div className="auth-actions">
              <div className="user-info">
                <span className="welcome-text">Patient ID: {user?.patientId} | URN : {user?.urn}</span>
                <button onClick={logout} className="logout-button">
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>



        {Object.keys(studies).length === 0 ? (
          <div className="no-studies">
            <h2>No DICOM studies found</h2>
            <p>Your medical imaging results will appear here once they are uploaded by your healthcare provider.</p>
            <p>If you believe there should be studies available, please contact your healthcare provider.</p>
          </div>
        ) : (
          <div className="studies-grid">
            {Object.entries(studies).map(([studyId, study]) => (
              <div key={studyId} className="study-card">
                <div className="study-thumbnail">
                  {study.thumbnail ? (
                    <img
                      src={`data:image/png;base64,${study.thumbnail}`}
                      alt="DICOM Preview"
                      className="thumbnail-image"
                    />
                  ) : (
                    <div className="thumbnail-placeholder">
                      📊 DICOM
                    </div>
                  )}
                </div>
                <div className="study-info">
                  <h3>{study.patientName || 'Medical Study'}</h3>
                  <div className="study-details">
                    <p><strong>Study Date:</strong> {study.studyDate || 'N/A'}</p>
                    <p><strong>Modality:</strong> {study.modality || 'N/A'}</p>
                    <p><strong>Description:</strong> {study.studyDescription || 'N/A'}</p>
                    <p><strong>Files:</strong> {study.files?.length || 0}</p>
                    <p><strong>Series:</strong> {Object.keys(study.series || {}).length}</p>
                  </div>
                  <Link
                    href={`/viewer/${encodeURIComponent(study.firstFile)}`}
                    className="view-button"
                  >
                    View Study
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
