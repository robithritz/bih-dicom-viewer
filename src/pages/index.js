import { useState, useEffect } from 'react';
import DatePicker from 'react-datepicker';
import { useRouter } from 'next/router';
import Link from 'next/link';
import LayoutPatient from '../components/LayoutPatient';
import { useAuth } from '../contexts/AuthContext';
import Image from 'next/image';
import dayjs from 'dayjs';

export default function PatientPortal() {
  const router = useRouter();
  const { user, logout, isAuthenticated, loading: authLoading } = useAuth();
  const [studies, setStudies] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Share modal state
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareStudyUID, setShareStudyUID] = useState(null);
  const [shareDuration, setShareDuration] = useState('7d');
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [shareExpiresAt, setShareExpiresAt] = useState(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [confirmRevokeOpen, setConfirmRevokeOpen] = useState(false);
  // Consent dialog state
  const [consentDialogOpen, setConsentDialogOpen] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);

  const [copiedUID, setCopiedUID] = useState(null);
  const [toast, setToast] = useState({ show: false, message: '' });

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

  const fetchStudies = async (params = {}) => {
    if (!user?.patientId) return;

    try {
      setLoading(true);
      // Build query string from provided params (e.g., { dateFrom, dateTo, modality, search, episodeType })
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          qs.append(key, String(val).trim());
        }
      });
      const baseUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/studies`;
      const url = qs.toString() ? `${baseUrl}?${qs.toString()}` : baseUrl;
      const response = await fetch(url,
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
    setShareDuration('7d');
    setShareError('');
    setShareUrl('');
    setShareExpiresAt(null);
    setShareCopied(false);
    setConsentDialogOpen(false);
    setConsentChecked(false);
  };

  const closeShareModal = () => {
    setShareModalOpen(false);
    setShareStudyUID(null);
    setShareDuration('7d');
    setShareLoading(false);
    setShareError('');
    setShareUrl('');
    setShareExpiresAt(null);
    setShareCopied(false);
    setConsentDialogOpen(false);
    setConsentChecked(false);
  };

  const handleCreateShare = async (e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
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

  const showToast = (message) => {
    setToast({ show: true, message });
    setTimeout(() => setToast({ show: false, message: '' }), 1500);
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
    // Map UI fields to API query params
    const params = {};
    if (data?.startDate) params.dateFrom = data.startDate; // expects YYYY-MM-DD
    if (data?.endDate) params.dateTo = data.endDate;       // expects YYYY-MM-DD
    // Pass episodeType for potential future support (API safely ignores unknown params)
    if (data?.episodeType && data.episodeType !== 'All') params.episodeType = data.episodeType;
    fetchStudies(params);
  };
  const onReset = () => {
    // Re-fetch without filters
    fetchStudies({});
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

  // Helpers for DICOM list layout (group by Episode from firstFile path)
  const extractEpisodeId = (study) => {
    const firstFile = study?.firstFile || '';
    const folder = firstFile.includes('/') ? firstFile.split('/')[0] : '';
    // Expect pattern like <something>_<EPISODEID>
    const parts = folder.split('_');
    if (parts.length >= 2) return parts[1].split('-')[0];
    return study?.episodeId || null;
  };

  const parseDate = (s) => {
    if (!s) return null;
    const iso = s.includes(' ') ? s.replace(' ', 'T') : s;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const formatLongDate = (d) => d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '-';
  const formatDateTime = (val) => {
    const d = typeof val === 'string' ? parseDate(val) : val;
    return d ? d.toLocaleString() : '';
  };
  const dayjsFormatDateTime = (val) => {
    const d = typeof val === 'string' ? parseDate(val) : val;
    return d ? dayjs(d).format('MMM D, YYYY, hh:mm A') : '';
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
                <path d="M6 14H3.33333C2.97971 14 2.64057 13.8595 2.39052 13.6095C2.14048 13.3594 2 13.0203 2 12.6667V3.33333C2 2.97971 2.14048 2.64057 2.39052 2.39052C2.64057 2.14048 2.97971 2 3.33333 2H6" stroke="#364153" strokeWidth="1.33333" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M10.6666 11.3332L14 7.99984L10.6666 4.6665" stroke="#364153" strokeWidth="1.33333" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M14 8H6" stroke="#364153" strokeWidth="1.33333" strokeLinecap="round" strokeLinejoin="round" />
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
                {/* <div className="patient-field">
                  <div className="patient-label">Phone Number</div>
                  <div className="patient-value">{phoneDisplay}</div>
                </div> */}
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
                      autoComplete="off"
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
                      autoComplete="off"
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
                    <option value="">All</option>
                    <option value="OB">Outpatient</option>
                    <option value="IB">Inpatient</option>
                    <option value="EB">Emergency</option>
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
            (() => {
              const entries = Object.entries(studies);
              const groups = entries.reduce((acc, [sid, st]) => {
                const ep = extractEpisodeId(st) || sid;
                if (!acc[ep]) acc[ep] = [];
                acc[ep].push({ id: sid, study: st });
                return acc;
              }, {});

              return (
                <div className="dicom-episodes space-y-4">
                  {Object.entries(groups).map(([epId, arr]) => {
                    const earliest = arr
                      .map((x) => dayjs(x.study.studyDate))
                      .sort((a, b) => a.diff(b))[0];
                    const headerDate = earliest ? earliest.format('MMM D, YYYY') : '-';
                    const episodeType = epId.substring(0, 2) == 'EB' ? 'Emergency Visit' : epId.substring(0, 2) == 'IB' ? 'Inpatient' : 'Outpatient';

                    return (
                      <div key={epId} className="episode-card border border-emerald-200 bg-white rounded-xl overflow-hidden">
                        <div className="episode-header flex items-center justify-between px-4 py-2 bg-emerald-50">
                          <div className="flex items-center gap-2 text-sm text-gray-700">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <rect x="3" y="5" width="18" height="16" rx="2" stroke="#6B7280" strokeWidth="1.5" />
                              <path d="M3 10h18" stroke="#6B7280" strokeWidth="1.5" />
                              <path d="M8 3v4M16 3v4" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                            <span>{headerDate}</span>
                            <span>{episodeType}</span>
                          </div>
                          <div className="episode-pill text-xs text-gray-700 bg-gray-100 border border-gray-200 rounded px-2 py-1">Episode: {epId}</div>
                        </div>

                        <div className="divide-y divide-gray-200">
                          {arr.sort((a, b) => (a.study.studyDate || '').localeCompare(b.study.studyDate)).map(({ id, study }) => (
                            <div key={id} className="study-item px-4 py-4">
                              <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="modality-pill inline-flex items-center px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-xs font-medium">
                                      {study.modality || '\u2014'}
                                    </span>
                                    <h4 className="study-title font-medium text-gray-900 truncate">
                                      {study.studyDescription || study.patientName || 'Study'}
                                    </h4>
                                  </div>

                                  <div className="study-meta-grid grid grid-cols-2 gap-x-10 gap-y-2 mt-2 text-sm">
                                    <div>
                                      <div className="meta-label text-gray-500">Study Date</div>
                                      <div className="meta-value text-gray-800">{dayjs(study.studyDate, 'YYYYMMDD').format('YYYY-MM-DD') || 'N/A'}</div>
                                    </div>
                                    <div>
                                      <div className="meta-label text-gray-500">Body Part</div>
                                      <div className="meta-value text-gray-800">{study.bodyPartExamined || study.bodyPart || '\u2014'}</div>
                                    </div>
                                    <div>
                                      <div className="meta-label text-gray-500">Series / Files</div>
                                      <div className="meta-value text-gray-800">{(study.totalSeries || 0)} / {(study.totalFiles || 0)}</div>
                                    </div>
                                    <div>
                                      <div className="meta-label text-gray-500">Status</div>
                                      <div>
                                        {/* <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${String(study.status || '').toLowerCase() === 'final' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-700'}`}>
                                          {study.status || '\u2014'}
                                        </span> */}
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700`}>
                                          Final
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Shared state block */}
                                  {study.isPublic && study.publicExpiresAt && (new Date(study.publicExpiresAt) > new Date()) && (
                                    (() => {
                                      const sharedAt = parseDate(study.updatedAt);
                                      const expires = parseDate(study.publicExpiresAt);
                                      const days = (sharedAt && expires) ? Math.max(1, Math.round((expires - sharedAt) / (1000 * 60 * 60 * 24))) : null;
                                      const token = study.publicToken;
                                      const href = token ? `/public/viewer/${encodeURIComponent(token)}` : null;
                                      return (
                                        <div className="shared-info border-t border-gray-200 mt-3 pt-3">
                                          <div className="shared-title flex items-center text-teal-700 text-sm font-medium mb-2">
                                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                              <g clipPath="url(#clip0_8_1351)">
                                                <path d="M12 5.3335C13.1046 5.3335 14 4.43807 14 3.3335C14 2.22893 13.1046 1.3335 12 1.3335C10.8954 1.3335 10 2.22893 10 3.3335C10 4.43807 10.8954 5.3335 12 5.3335Z" stroke="#009689" strokeWidth="1.33333" strokeLinecap="round" strokeLinejoin="round" />
                                                <path d="M4 10C5.10457 10 6 9.10457 6 8C6 6.89543 5.10457 6 4 6C2.89543 6 2 6.89543 2 8C2 9.10457 2.89543 10 4 10Z" stroke="#009689" strokeWidth="1.33333" strokeLinecap="round" strokeLinejoin="round" />
                                                <path d="M12 14.6665C13.1046 14.6665 14 13.7711 14 12.6665C14 11.5619 13.1046 10.6665 12 10.6665C10.8954 10.6665 10 11.5619 10 12.6665C10 13.7711 10.8954 14.6665 12 14.6665Z" stroke="#009689" strokeWidth="1.33333" strokeLinecap="round" strokeLinejoin="round" />
                                                <path d="M5.72668 9.00684L10.28 11.6602" stroke="#009689" strokeWidth="1.33333" strokeLinecap="round" strokeLinejoin="round" />
                                                <path d="M10.2734 4.33984L5.72668 6.99318" stroke="#009689" strokeWidth="1.33333" strokeLinecap="round" strokeLinejoin="round" />
                                              </g>
                                              <defs>
                                                <clipPath id="clip0_8_1351">
                                                  <rect width="16" height="16" fill="white" />
                                                </clipPath>
                                              </defs>
                                            </svg>

                                            <span className="ml-1">Shared Information</span>
                                          </div>
                                          <div className="space-y-1 text-sm">
                                            <div className="flex flex-row">
                                              {sharedAt && (
                                                <div className="shared-row flex items-center gap-2 text-gray-700">
                                                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                    <g clipPath="url(#clip0_8_1361)">
                                                      <path d="M6 11C8.76142 11 11 8.76142 11 6C11 3.23858 8.76142 1 6 1C3.23858 1 1 3.23858 1 6C1 8.76142 3.23858 11 6 11Z" stroke="#4A5565" strokeLinecap="round" strokeLinejoin="round" />
                                                      <path d="M6 3V6L8 7" stroke="#4A5565" strokeLinecap="round" strokeLinejoin="round" />
                                                    </g>
                                                    <defs>
                                                      <clipPath id="clip0_8_1361">
                                                        <rect width="12" height="12" fill="white" />
                                                      </clipPath>
                                                    </defs>
                                                  </svg>
                                                  <span className="text-gray-600">Shared:</span>
                                                  <span className="text-gray-900">{dayjsFormatDateTime(sharedAt)}</span>
                                                </div>
                                              )}
                                              {expires && (
                                                <div className="shared-row flex items-center gap-2 text-gray-700 flex-wrap ml-2">
                                                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                    <g clipPath="url(#clip0_8_1361)">
                                                      <path d="M6 11C8.76142 11 11 8.76142 11 6C11 3.23858 8.76142 1 6 1C3.23858 1 1 3.23858 1 6C1 8.76142 3.23858 11 6 11Z" stroke="#4A5565" strokeLinecap="round" strokeLinejoin="round" />
                                                      <path d="M6 3V6L8 7" stroke="#4A5565" strokeLinecap="round" strokeLinejoin="round" />
                                                    </g>
                                                    <defs>
                                                      <clipPath id="clip0_8_1361">
                                                        <rect width="12" height="12" fill="white" />
                                                      </clipPath>
                                                    </defs>
                                                  </svg>
                                                  <span className="text-gray-600">Expires:</span>
                                                  <span className="text-gray-900">{dayjsFormatDateTime(expires)}</span>
                                                  {days && (
                                                    <span className="shared-valid inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700 ml-2">{`Valid for ${days} days`}</span>
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                            {href && (
                                              <div className="shared-row flex items-center gap-2 text-gray-700 flex-wrap">
                                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                  <g clipPath="url(#clip0_8_1379)">
                                                    <path d="M5 6.49998C5.21473 6.78705 5.48868 7.02457 5.80328 7.19645C6.11787 7.36833 6.46575 7.47054 6.82333 7.49615C7.1809 7.52176 7.53979 7.47017 7.87567 7.34487C8.21155 7.21958 8.51656 7.02352 8.77 6.76998L10.27 5.26998C10.7254 4.79848 10.9774 4.16697 10.9717 3.51148C10.966 2.85599 10.7031 2.22896 10.2395 1.76544C9.77603 1.30192 9.14899 1.03899 8.4935 1.0333C7.83801 1.0276 7.20651 1.27959 6.735 1.73498L5.875 2.58998" stroke="#4A5565" strokeLinecap="round" strokeLinejoin="round" />
                                                    <path d="M6.99998 5.50011C6.78525 5.21305 6.5113 4.97552 6.1967 4.80364C5.88211 4.63176 5.53422 4.52955 5.17665 4.50395C4.81908 4.47834 4.46018 4.52993 4.12431 4.65522C3.78843 4.78051 3.48342 4.97658 3.22998 5.23011L1.72998 6.73011C1.27458 7.20162 1.0226 7.83312 1.02829 8.48862C1.03399 9.14411 1.29691 9.77114 1.76043 10.2347C2.22395 10.6982 2.85098 10.9611 3.50647 10.9668C4.16197 10.9725 4.79347 10.7205 5.26498 10.2651L6.11998 9.41011" stroke="#4A5565" strokeLinecap="round" strokeLinejoin="round" />
                                                  </g>
                                                  <defs>
                                                    <clipPath id="clip0_8_1379">
                                                      <rect width="12" height="12" fill="white" />
                                                    </clipPath>
                                                  </defs>
                                                </svg>

                                                <span className="text-gray-600">Link:</span>
                                                <a
                                                  href={href}
                                                  className="text-blue-600 hover:underline break-all cursor-pointer"
                                                  onClick={async (e) => {
                                                    e.preventDefault();
                                                    try {
                                                      const base = typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_APP_URL || window.location.origin) : '';
                                                      const url = `${base}${href.startsWith('/') ? '' : '/'}${href}`;
                                                      await navigator.clipboard.writeText(url);
                                                      showToast('Link copied to clipboard');
                                                    } catch (err) {
                                                      showToast('Failed to copy link');
                                                    }
                                                  }}
                                                  role="button"
                                                >
                                                  {href}
                                                </a>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })()
                                  )}
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  <Link href={`/viewer/${encodeURIComponent(study.firstFile || '')}`} className="btn-view-teal inline-flex items-center gap-1 px-3 py-2 rounded-lg text-white" style={{ backgroundColor: '#5D9CAD' }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z" stroke="currentColor" strokeWidth="1.5" /><circle cx="12" cy="12" r="3" fill="currentColor" /></svg>
                                    <span>View</span>
                                  </Link>
                                  <button type="button" onClick={() => openShareModal(study.studyInstanceUID || id)} className="btn-share inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-50">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" stroke="#6B7280" strokeWidth="1.5" /><path d="M16 8l-4-4-4 4" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M12 4v12" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" /></svg>
                                    <span>Share</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()
          )}
        </div>

        {/* white space */}
        <div style={{ height: '50px' }}></div>
      </div>

      {shareModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[1000] flex items-center justify-center p-4">
          {(() => {
            const entry = Object.entries(studies || {}).find(([sid, st]) => (st?.studyInstanceUID || sid) === shareStudyUID);
            const study = entry?.[1];
            const isActive = !!(study?.isPublic && study?.publicExpiresAt && new Date(study.publicExpiresAt) > new Date());
            const createdAt = study?.publicCreatedAt ? parseDate(study.publicCreatedAt) : null;
            const expiresAt = study?.publicExpiresAt ? parseDate(study.publicExpiresAt) : null;
            const daysLeft = expiresAt ? Math.max(0, Math.ceil((expiresAt - new Date()) / (1000 * 60 * 60 * 24))) : null;
            const token = study?.publicToken;
            const base = typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_APP_URL || window.location.origin) : '';
            const modalShareUrl = token ? `${base}/public/viewer/${encodeURIComponent(token)}` : '';

            const DurationBtn = ({ value, label }) => (
              <button
                type="button"
                onClick={() => setShareDuration(value)}
                disabled={isActive}
                className={`px-3 py-2 rounded-lg border text-sm ${shareDuration === value ? 'bg-[#155DFC] border-[#155DFC] text-white shadow-sm' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'} ${isActive ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {label}
              </button>
            );

            // Compute preview expiry based on selected duration
            const durationDays = parseInt(String(shareDuration).replace(/[^0-9]/g, ''), 10) || 7;
            const previewExpiry = dayjs().add(durationDays, 'day');

            return (
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-5 relative">
                <button onClick={closeShareModal} aria-label="Close" className="absolute top-3 right-3 text-gray-400 hover:text-gray-600">×</button>
                <h2 className="text-lg font-semibold text-gray-900">Share Study</h2>
                <div className="text-sm text-gray-500 mt-0.5">{study?.studyDescription || study?.patientName || 'Medical Study'}</div>

                {/* Create New Share Link */}
                <div className="mt-5">
                  <div className="text-sm font-medium text-gray-900 mb-2">Create New Share Link</div>

                  {/* Important Security Information */}
                  <div className="flex items-start gap-2 bg-blue-50 text-blue-800 border border-blue-200 rounded-lg p-3 mb-3">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="mt-0.5">
                      <circle cx="12" cy="12" r="9" stroke="#155DFC" strokeWidth="1.5" />
                      <path d="M12 8v.01M11 11h1v5h1" stroke="#155DFC" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    <div>
                      <div className="font-medium text-sm">Important Security Information</div>
                      <div className="text-sm">Only share this link with trusted recipients. Anyone with the link can view this study until it expires. Do not post publicly.</div>
                    </div>
                  </div>

                  <div className="text-sm text-gray-700 mb-2">Link Expiration</div>
                  <div className="grid grid-cols-4 gap-2">
                    <DurationBtn value="1d" label="1 day" />
                    <DurationBtn value="7d" label="7 days" />
                    <DurationBtn value="14d" label="14 days" />
                    <DurationBtn value="30d" label="30 days" />
                  </div>
                  {/* Expiration preview */}
                  <div className="text-xs text-gray-600 mt-2">Link will expire on {previewExpiry.format('MMMM D, YYYY [at] hh:mm A')}</div>

                  <button
                    type="button"
                    onClick={() => setConsentDialogOpen(true)}
                    disabled={isActive || shareLoading || !shareStudyUID}
                    className={`w-full mt-3 px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 ${isActive ? 'bg-gray-200 text-gray-600 cursor-not-allowed' : 'bg-[#155DFC] text-white hover:bg-[#0f49d9]'}`}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10 13a5 5 0 0 1 0-7l1-1a5 5 0 0 1 7 7l-1 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M14 11a5 5 0 0 1 0 7l-1 1a5 5 0 0 1-7-7l1-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    Generate Share Link
                  </button>
                  {shareError && <div className="text-red-500 text-sm mt-1">{shareError}</div>}
                </div>

                {/* Active Share Links */}
                <div className="mt-6 pt-4 border-t border-gray-200">
                  <div className="text-sm font-medium text-gray-900 mb-2">Active Share Links</div>
                  {isActive ? (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <div className="text-xs text-gray-600 break-all flex items-start gap-2">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="mt-0.5"><path d="M10 13a5 5 0 0 1 0-7l1-1a5 5 0 0 1 7 7l-1 1" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M14 11a5 5 0 0 1 0 7l-1 1a5 5 0 0 1-7-7l1-1" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        <span>{modalShareUrl}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-600 mt-2">
                        {createdAt && <div>Created: {formatDateTime(createdAt)}</div>}
                        {typeof daysLeft === 'number' && <div className="flex items-center gap-1">• <span>Expires in {daysLeft} days</span></div>}
                      </div>

                      <div className="mt-3 flex items-center gap-2">
                        <input readOnly value={modalShareUrl} className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                        <button type="button" onClick={async () => { if (!modalShareUrl) return; await navigator.clipboard.writeText(modalShareUrl); setShareCopied(true); setTimeout(() => setShareCopied(false), 1200); }} className="px-3 py-2 rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 text-sm">{shareCopied ? 'Copied!' : 'Copy Link'}</button>
                        <button type="button" onClick={() => setConfirmRevokeOpen(true)} className="px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 text-sm">Revoke</button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-gray-500 text-sm flex items-center gap-2">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10 13a5 5 0 0 1 0-7l1-1a5 5 0 0 1 7 7l-1 1" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M14 11a5 5 0 0 1 0 7l-1 1a5 5 0 0 1-7-7l1-1" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      <span>No active share links yet</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {consentDialogOpen && (
        <div className="fixed inset-0 bg-black/70 z-[1150] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-yellow-50 border border-yellow-200 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3l8 4v5c0 5-3.5 9-8 9s-8-4-8-9V7l8-4Z" stroke="#D97706" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M12 9v4" stroke="#D97706" strokeWidth="1.5" strokeLinecap="round" /><circle cx="12" cy="16" r=".75" fill="#D97706" /></svg>
              </div>
              <div>
                <div className="text-base font-semibold text-gray-900">Data Sharing Consent</div>
                <div className="text-sm text-gray-600 mt-1">Please read and agree to the following before generating a share link:</div>
              </div>
            </div>

            <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
              <div className="font-medium mb-1 flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2 2 22h20L12 2Z" stroke="#D97706" strokeWidth="1.5" /><path d="M12 9v4" stroke="#D97706" strokeWidth="1.5" strokeLinecap="round" /><circle cx="12" cy="17" r=".75" fill="#D97706" /></svg>
                <span>Important Notice</span>
              </div>
              <ul className="list-disc pl-5 space-y-1">
                <li>Your radiology imaging data will be shared externally via a publicly accessible link.</li>
                <li>Anyone with the link can view your medical imaging until the expiration date.</li>
                <li>Bali International Hospital (BIH) is no longer responsible for the security, privacy, or use of this data once shared externally.</li>
                <li>You are solely responsible for ensuring that the link is only shared with trusted healthcare providers or individuals.</li>
                <li>This action cannot be undone, but you can revoke the link at any time.</li>
              </ul>
            </div>

            <label className="mt-4 flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 text-[#155DFC] border-gray-300 rounded"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
              />
              <span>I understand and agree that my radiology data will be shared externally, and I acknowledge that Bali International Hospital (BIH) is no longer responsible for the data once shared.</span>
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setConsentDialogOpen(false); setConsentChecked(false); }}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!consentChecked || shareLoading}
                onClick={async () => { await handleCreateShare(); setConsentDialogOpen(false); setConsentChecked(false); }}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${(!consentChecked || shareLoading) ? 'bg-gray-200 text-gray-600 cursor-not-allowed' : 'bg-[#155DFC] text-white hover:bg-[#0f49d9]'}`}
              >
                {shareLoading ? 'Generating...' : 'I Agree & Generate Link'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmRevokeOpen && (
        <div className="fixed inset-0 bg-black/70 z-[1100] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-50 flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="#DC2626" strokeWidth="1.5" /><path d="M12 8v.01M11 11h1v5h1" stroke="#DC2626" strokeWidth="1.5" strokeLinecap="round" /></svg>
              </div>
              <div>
                <div className="text-base font-semibold text-gray-900">Revoke Share Link</div>
                <div className="text-sm text-gray-600 mt-1">Are you sure you want to revoke access to this share link? Anyone with this link will no longer be able to view the study. This action cannot be undone.</div>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmRevokeOpen(false)} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 text-sm">Cancel</button>
              <button type="button" onClick={async () => { await handleRevokeShare(shareStudyUID); setConfirmRevokeOpen(false); }} className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 text-sm">Revoke Link</button>
            </div>
          </div>
        </div>
      )}

      {toast.show && (
        <div className="fixed bottom-4 right-4 z-[1200]">
          <div className="bg-gray-900 text-white text-sm px-3 py-2 rounded-lg shadow-lg flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10Z" fill="#10B981" opacity="0.15" /><path d="M9 12.5l2 2 4-4" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span>{toast.message}</span>
          </div>
        </div>
      )}

    </LayoutPatient >
  );
}
