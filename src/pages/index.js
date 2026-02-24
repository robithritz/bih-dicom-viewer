import { useState, useEffect } from 'react';
import DatePicker from 'react-datepicker';
import { useRouter } from 'next/router';
import Link from 'next/link';
import LayoutPatient from '../components/LayoutPatient';
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

  const [copiedUID, setCopiedUID] = useState(null);

  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [episodeType, setEpisodeType] = useState('All');

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
      <LayoutPatient>
        <div className="loading">Loading...</div>
      </LayoutPatient>
    );
  }

  // Don't render anything if not authenticated (will redirect)
  if (!isAuthenticated) {
    return null;
  }

  if (loading) {
    return (
      <LayoutPatient>
        <div className="container">
          <div className="header bg-soft-gradient color-black">
            <h1 className="flex justify-center">
              <Image src={`${router.basePath}/images/bih-logo.png`} alt="Logo" width={200} height={80} />
              DICOM Viewer</h1>
            <p>Loading your medical imaging studies...</p>
          </div>
        </div>
      </LayoutPatient>
    );
  }

  if (error) {
    return (
      <LayoutPatient>
        <div className="container">
          <div className="header bg-soft-gradient color-black">
            <h1 className="flex justify-center">
              <Image src={`${router.basePath}/images/bih-logo.png`} alt="Logo" width={200} height={80} />
              DICOM Viewer
            </h1>
            <p style={{ color: 'red' }}>Error: {error}</p>
            <button onClick={fetchStudies}>Retry</button>
          </div>
        </div>
      </LayoutPatient>
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
      // Refresh studies so the badge reflects the new public status
      await fetchStudies();
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

  // Quick actions for public badge
  const handleCopyPublicLink = async (study) => {
    const token = study?.publicToken;
    if (!token) return;
    const base = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '');
    const url = `${base}/public/viewer/${encodeURIComponent(token)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUID(study.studyInstanceUID);
      setTimeout(() => setCopiedUID(null), 1500);
    } catch (e) {
      console.error('Copy failed', e);
    }
  };

  const handleRevokeShare = async (studyInstanceUID) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/studies/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth-token')}`
        },
        body: JSON.stringify({ studyInstanceUID })
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Failed to revoke share: ${res.status} ${t}`);
      }
      await fetchStudies();
    } catch (err) {
      console.error(err);
      alert('Failed to revoke share');
    }
  };

  // Derived display fields for the header cards
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.firstName || user?.email || 'Patient';
  const formatDOB = (raw) => {
    if (!raw) return '-';
    try {
      const d = new Date(raw);
      if (!isNaN(d)) {
        return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      }
    } catch (_) { /* ignore */ }
    // Fallback to the original string if parsing fails
    return String(raw);
  };
  const dobDisplay = formatDOB(user?.dob);
  const phoneDisplay = user?.phone || user?.phoneNumber || user?.tel || '-';

  // Handlers for the additional card (stubs as requested)
  const onApply = (data) => {
    console.log(data);
  };
  const onReset = (data) => {
    console.log(data);
  };

  const toYMD = (d) => {
    if (!d) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  const handleApplyFilter = () => {
    onApply({ startDate: toYMD(startDate), endDate: toYMD(endDate), episodeType });
  };

  const handleResetFilter = () => {
    const reset = { startDate: '', endDate: '', episodeType: 'All' };
    setStartDate(null);
    setEndDate(null);
    setEpisodeType('All');
    onReset(reset);
  };

  return (
    <LayoutPatient>
      <div className="bg-soft-gradient max-w-full">
        {/* Top navbar */}
        <nav className="portal-navbar">
          <div className="navbar-inner">
            <div className="navbar-brand">
              <Image src={`${router.basePath}/images/bih-logo.png`} alt="Bali International Hospital" width={142} height={142} />
              <div className="brand-text">
                <div className="brand-title">DICOM Viewer</div>
                <div className="brand-subtitle">Bali International Hospital</div>
              </div>
            </div>
            <button onClick={logout} type="button" className="portal-logout" aria-label="Logout">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 14H3.33333C2.97971 14 2.64057 13.8595 2.39052 13.6095C2.14048 13.3594 2 13.0203 2 12.6667V3.33333C2 2.97971 2.14048 2.64057 2.39052 2.39052C2.64057 2.14048 2.97971 2 3.33333 2H6" stroke="#364153" stroke-width="1.33333" stroke-linecap="round" stroke-linejoin="round" />
                <path d="M10.6666 11.3332L14 7.99984L10.6666 4.6665" stroke="#364153" stroke-width="1.33333" stroke-linecap="round" stroke-linejoin="round" />
                <path d="M14 8H6" stroke="#364153" stroke-width="1.33333" stroke-linecap="round" stroke-linejoin="round" />
              </svg>

              <span>Logout</span>
            </button>
          </div>
        </nav>

        {/* Hero area with welcome + patient info cards */}
        <section className="portal-hero">
          <div className="container">
            <div className="welcome-card">
              <h2 className="welcome-title">Welcome, {fullName}!</h2>
              <p className="welcome-desc">Access your radiology imaging results securely. View, download, and share your medical images with healthcare providers.</p>
            </div>

            <div className="patient-card">
              <h3 className="patient-title">Patient Information</h3>
              <div className="patient-grid-3">
                <div className="patient-field">
                  <div className="patient-label">Full Name</div>
                  <div className="patient-value">{fullName}</div>
                </div>
                <div className="patient-field">
                  <div className="patient-label">URN Number</div>
                  <div className="patient-value">{user?.urn || '-'}</div>
                </div>
                <div className="patient-field">
                  <div className="patient-label">Date of Birth</div>
                  <div className="patient-value">{dobDisplay}</div>
                </div>
              </div>
              <div className="patient-grid-3">
                <div className="patient-field">
                  <div className="patient-label">Email Address</div>
                  <div className="patient-value">{user?.email || '-'}</div>
                </div>
                <div className="patient-field">
                  <div className="patient-label">Phone Number</div>
                  <div className="patient-value">{phoneDisplay}</div>
                </div>
                <div className="patient-field">
                </div>
              </div>
            </div>

            {/* Additional card below Patient Information */}
            <div className="patient-card mt-5">
              {/* Header row: Date Range (left) and Episode Type (right) */}
              <div className="flex items-center justify-between mb-2">
                <div className="filter-label">Date Range</div>
              </div>

              {/* Controls row */}
              <div className="flex items-end gap-3 md:gap-4">
                {/* From */}
                <div className="flex-1">
                  <label htmlFor="startDate" className="text-xs text-gray-500 mb-1 block">From</label>
                  <div className="filter-input-wrap">
                    <DatePicker
                      id="startDate"
                      selected={startDate}
                      onChange={(date) => setStartDate(date)}
                      dateFormat="MM/dd/yyyy"
                      placeholderText="mm/dd/yyyy"
                      className="filter-input"
                      wrapperClassName="w-full"
                      selectsStart
                      startDate={startDate}
                      endDate={endDate}
                      maxDate={endDate || undefined}
                      isClearable={false}
                    />
                    <svg className="filter-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <rect x="3" y="5" width="18" height="16" rx="2" stroke="#6B7280" strokeWidth="1.5" />
                      <path d="M3 10h18" stroke="#6B7280" strokeWidth="1.5" />
                      <path d="M8 3v4M16 3v4" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </div>
                </div>

                <span className="text-gray-400 mb-3">—</span>

                {/* To */}
                <div className="flex-1">
                  <label htmlFor="endDate" className="text-xs text-gray-500 mb-1 block">To</label>
                  <div className="filter-input-wrap">
                    <DatePicker
                      id="endDate"
                      selected={endDate}
                      onChange={(date) => setEndDate(date)}
                      dateFormat="MM/dd/yyyy"
                      placeholderText="mm/dd/yyyy"
                      className="filter-input"
                      wrapperClassName="w-full"
                      selectsEnd
                      startDate={startDate}
                      endDate={endDate}
                      minDate={startDate || undefined}
                      isClearable={false}
                    />
                    <svg className="filter-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <rect x="3" y="5" width="18" height="16" rx="2" stroke="#6B7280" strokeWidth="1.5" />
                      <path d="M3 10h18" stroke="#6B7280" strokeWidth="1.5" />
                      <path d="M8 3v4M16 3v4" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </div>
                </div>

                {/* Episode Type */}
                <div className="filter-select-wrap">
                  <label htmlFor="episodeType" className="text-sm text-gray-500 mb-1 block">Episode Type</label>
                  {/* <label htmlFor="episodeType" className="sr-only">Episode Type</label> */}
                  <select
                    id="episodeType"
                    className="filter-select"
                    value={episodeType}
                    onChange={(e) => setEpisodeType(e.target.value)}
                  >
                    <option value="All">All</option>
                    <option value="Outpatient">Outpatient</option>
                    <option value="Inpatient">Inpatient</option>
                    <option value="Emergency">Emergency</option>
                  </select>
                  <svg className="filter-caret" width="16" height="48" viewBox="0 -20 24 24" fill="none" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>

                {/* Actions */}
                <div className="ml-auto flex items-center gap-2">
                  <button type="button" className="btn-apply" onClick={handleApplyFilter}>Apply</button>
                  <button type="button" className="btn-reset" onClick={handleResetFilter}>Reset</button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="container" style={{ marginTop: 16 }}>
          {Object.keys(studies).length === 0 ? (
            <div className="no-studies">
              <h2>No DICOM studies found</h2>
              <p>Your medical imaging results will appear here once they are uploaded by your healthcare provider.</p>
              <p>If you believe there should be studies available, please contact your healthcare provider.</p>
            </div>
          ) : (
            <div className="studies-grid">
              {Object.entries(studies).map(([studyId, study]) => (
                <div key={studyId} className="study-card" style={{ position: 'relative' }}>
                  {study.isPublic && study.publicExpiresAt && (new Date(study.publicExpiresAt) > new Date()) && (
                    <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ background: '#1f2937', color: '#d1fae5', border: '1px solid #10b981', padding: '4px 8px', borderRadius: 12, fontSize: 12 }}>
                        Public until {new Date(study.publicExpiresAt).toLocaleString()}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyPublicLink(study)}
                        className="view-button"
                        style={{ background: '#0ea5e9' }}
                      >
                        {copiedUID === (study.studyInstanceUID || studyId) ? 'Copied!' : 'Copy Link'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRevokeShare(study.studyInstanceUID || studyId)}
                        className="view-button"
                        style={{ background: '#b91c1c' }}
                      >
                        Revoke
                      </button>
                    </div>
                  )}


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
      </div>

      {
        shareModalOpen && (
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
        )
      }

    </LayoutPatient >
  );
}
