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

  // Share modal state
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareStudyUID, setShareStudyUID] = useState(null);
  const [shareDuration, setShareDuration] = useState('1w');
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [shareExpiresAt, setShareExpiresAt] = useState(null);
  const [shareCopied, setShareCopied] = useState(false);

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
      const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/studies`,
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
              <Image src={`${router.basePath}/images/ihc-white.png`} alt="Logo" width={200} height={80} />
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
              <Image src={`${router.basePath}/images/ihc-white.png`} alt="Logo" width={200} height={80} />
              DICOM Viewer
            </h1>
            <p style={{ color: 'red' }}>Error: {error}</p>
            <button onClick={fetchStudies}>Retry</button>
          </div>
        </div>
      </Layout>
    );
  }

  // Share modal handlers
  const openShareModal = (uid) => {
    setShareModalOpen(true);
    setShareStudyUID(uid);
    setShareDuration('1w');
    setShareError('');
    setShareUrl('');
    setShareExpiresAt(null);
    setShareCopied(false);
  };

  const closeShareModal = () => {
    setShareModalOpen(false);
    setShareStudyUID(null);
    setShareDuration('1w');
    setShareLoading(false);
    setShareError('');
    setShareUrl('');
    setShareExpiresAt(null);
    setShareCopied(false);
  };

  const handleCreateShare = async (e) => {
    e.preventDefault();
    if (!shareStudyUID) return;
    try {
      setShareLoading(true);
      setShareError('');
      const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/studies/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth-token')}`
        },
        body: JSON.stringify({ studyInstanceUID: shareStudyUID, duration: shareDuration })
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Failed to create share: ${res.status} ${t}`);
      }
      const data = await res.json();
      setShareUrl(data.shareUrl || '');
      setShareExpiresAt(data.expiresAt || null);
    } catch (err) {
      setShareError(err.message || 'Failed to create share');
    } finally {
      setShareLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1500);
    } catch (err) {
      setShareError('Failed to copy link');
    }
  };

  return (
    <Layout>
      <div className="container">
        <div className="header">
          <h1 className="flex justify-center">
            <Image src={`${router.basePath}/images/ihc-white.png`} alt="Logo" width={200} height={80} />
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
                    <p><strong>Patient ID:</strong> {study.patientID || 'N/A'}</p>
                    {(() => {
                      // Extract episode ID from folder name or firstFile path
                      const firstFile = study.firstFile || '';
                      const folderName = firstFile.includes('/') ? firstFile.split('/')[0] : '';
                      const episodeId = folderName.includes('_') ? folderName.split('_').slice(1).join('_') : null;
                      return episodeId ? (
                        <p><strong>Episode ID:</strong> {episodeId}</p>
                      ) : null;
                    })()}
                    <p><strong>Modality:</strong> {study.modality || 'N/A'}</p>
                    <p><strong>Description:</strong> {study.studyDescription || 'N/A'}</p>
                    <p><strong>Files:</strong> {study.totalFiles || 0}</p>
                    <p><strong>Series:</strong> {study.totalSeries || 0}</p>
                  </div>
                  <div className="actions" style={{ display: 'flex', gap: 8 }}>
                    <Link
                      href={`/viewer/${encodeURIComponent(study.firstFile)}`}
                      className="view-button"
                    >
                      View Study
                    </Link>
                    <button
                      type="button"
                      onClick={() => openShareModal(study.studyInstanceUID || studyId)}
                      className="view-button"
                      style={{ background: '#4f46e5' }}
                    >
                      Share
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {shareModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#111827', color: '#fff', borderRadius: '8px', width: '100%', maxWidth: '640px', padding: '20px', position: 'relative', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
            <button onClick={closeShareModal} aria-label="Close" style={{ position: 'absolute', top: '10px', right: '10px', background: 'transparent', border: 'none', color: '#fff', fontSize: '20px', cursor: 'pointer' }}>×</button>
            <h2 style={{ margin: '0 0 12px', fontSize: '18px', fontWeight: 600 }}>Share Study</h2>

            <div style={{ background: '#1f2937', borderRadius: '6px', padding: '10px', maxHeight: '160px', overflowY: 'auto', marginBottom: '12px', fontSize: '14px', lineHeight: 1.5 }}>
              <p style={{ opacity: 0.85 }}>
                By creating a public link, anyone with the link can view this study until the expiration time you select. Do not share links publicly unless appropriate.
              </p>
            </div>

            <form onSubmit={handleCreateShare} style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '12px' }}>
              <label htmlFor="shareDuration" style={{ whiteSpace: 'nowrap' }}>Share duration:</label>
              <select
                id="shareDuration"
                value={shareDuration}
                onChange={(e) => setShareDuration(e.target.value)}
                disabled={shareLoading}
                style={{ flex: '0 0 160px', background: '#111827', border: '1px solid #374151', color: '#fff', padding: '8px 10px', borderRadius: '6px' }}
              >
                <option value="1w">1 week</option>
                <option value="1m">1 month</option>
              </select>

              <button type="submit" disabled={shareLoading || !shareStudyUID} className="view-button" style={{ background: '#4f46e5' }}>
                {shareLoading ? 'Creating...' : 'Create Share Link'}
              </button>
            </form>

            {shareError && (
              <div style={{ color: '#fca5a5', marginBottom: '8px' }}>{shareError}</div>
            )}

            {shareUrl && (
              <div style={{ background: '#1f2937', borderRadius: '6px', padding: '10px', marginBottom: '8px' }}>
                <div style={{ fontSize: '12px', opacity: 0.8, marginBottom: '6px' }}>Public link</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    readOnly
                    value={shareUrl}
                    style={{ flex: 1, background: '#111827', color: '#fff', border: '1px solid #374151', borderRadius: '6px', padding: '8px 10px' }}
                  />
                  <button type="button" onClick={handleCopyLink} className="view-button" style={{ background: '#4f46e5', whiteSpace: 'nowrap' }}>
                    {shareCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                {shareExpiresAt && (
                  <div style={{ fontSize: '12px', opacity: 0.7, marginTop: '6px' }}>
                    Expires: {new Date(shareExpiresAt).toLocaleString()}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={closeShareModal} className="view-button" style={{ background: '#374151' }}>Close</button>
            </div>
          </div>
        </div>
      )}

    </Layout>
  );
}
