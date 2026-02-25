import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';

// Dynamically import cornerstone to avoid SSR issues
const CornerstoneViewer = dynamic(() => import('./CornerstoneViewer'), {
  ssr: false,
  loading: () => <div>Loading DICOM viewer...</div>
});

export default function DicomViewer({ filename, isAdmin = false, isPublic = false, publicToken = null }) {
  const [metadata, setMetadata] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showFileBrowser, setShowFileBrowser] = useState(true); // Track FileBrowser state
  const router = useRouter();

  // Handle FileBrowser toggle from CornerstoneViewer
  const handleFileBrowserToggle = (isVisible) => {
    setShowFileBrowser(isVisible);
  };

  // Handle closing the viewer (top-right navbar button)
  const handleClose = () => {
    try {
      if (typeof window !== 'undefined' && window.history.length > 1) {
        router.back();
        return;
      }
    } catch (_) { }
    if (isAdmin) {
      router.replace('/portal');
    } else {
      router.replace('/');
    }
  };
  useEffect(() => {
    if (filename) {
      fetchMetadata();
    }
  }, [filename, isPublic, publicToken, isAdmin]);

  const fetchMetadata = async () => {
    try {
      setLoading(true);
      const base = process.env.NEXT_PUBLIC_APP_URL;
      const apiPath = isAdmin
        ? `${base}/api/admin/dicom-info/${encodeURIComponent(filename)}`
        : isPublic && publicToken
          ? `${base}/api/public/dicom-info/${encodeURIComponent(publicToken)}/${encodeURIComponent(filename)}`
          : `${base}/api/dicom-info/${encodeURIComponent(filename)}`;

      const headers = {};
      if (!isPublic) {
        headers['Authorization'] = isAdmin
          ? `Bearer ${localStorage.getItem('admin-auth-token')}`
          : `Bearer ${localStorage.getItem('auth-token')}`;
      }

      const response = await fetch(apiPath, { headers });

      if (!response.ok) {
        console.error("❌ API ERROR:", {
          status: response.status,
          statusText: response.statusText,
          url: apiPath
        });

        if (!isPublic && response.status == 401) {
          router.replace(isAdmin ? '/portal' : '/login');
        }
        throw new Error(`Failed to fetch DICOM metadata: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();

      // extract episodeId from uploadedFolderName
      const epsId = filename?.split('_')[1].split('-')[0];
      setMetadata({ ...data, episodeId: epsId });

    } catch (err) {
      console.error("❌ FETCH ERROR:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="viewer-container">
        <div className="loading">Loading DICOM file...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="viewer-container">
        <div className="error">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="viewer-root">
      {/* Full-width dark navbar */}
      <div className="viewer-navbar">
        <div className="navbar-inner">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8.74992 1.1665H3.49992C3.1905 1.1665 2.89375 1.28942 2.67496 1.50821C2.45617 1.72701 2.33325 2.02375 2.33325 2.33317V11.6665C2.33325 11.9759 2.45617 12.2727 2.67496 12.4915C2.89375 12.7103 3.1905 12.8332 3.49992 12.8332H10.4999C10.8093 12.8332 11.1061 12.7103 11.3249 12.4915C11.5437 12.2727 11.6666 11.9759 11.6666 11.6665V4.08317L8.74992 1.1665Z" stroke="white" stroke-width="1.16667" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M8.16675 1.1665V3.49984C8.16675 3.80926 8.28966 4.106 8.50846 4.3248C8.72725 4.54359 9.024 4.6665 9.33341 4.6665H11.6667" stroke="white" stroke-width="1.16667" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M5.83341 8.16683C6.47775 8.16683 7.00008 7.64449 7.00008 7.00016C7.00008 6.35583 6.47775 5.8335 5.83341 5.8335C5.18908 5.8335 4.66675 6.35583 4.66675 7.00016C4.66675 7.64449 5.18908 8.16683 5.83341 8.16683Z" stroke="white" stroke-width="1.16667" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M11.6667 9.91671L10.9107 9.16071C10.647 8.89711 10.2895 8.74902 9.91667 8.74902C9.54385 8.74902 9.18631 8.89711 8.92267 9.16071L5.25 12.8334" stroke="white" stroke-width="1.16667" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <div className="navbar-title" title={filename}>DICOM Viewer</div>

          {/* // add current shown file dcm name */}
          <span className="hide-on-mobile">{filename}</span>

          {/* </div> */}
        </div>
        <button
          className="navbar-close"
          onClick={handleClose}
          aria-label="Close viewer"
          title="Close"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="viewer-navbar-patient-info">
        <div className="navbar-inner">
          <div className="navbar-meta">
            {metadata?.patientName && <span>Patient: <span className="color-white">{metadata.patientName}</span></span>}
            {metadata?.studyDescription && <span>Study: <span className="color-white">{metadata.studyDescription}</span></span>}
            {(metadata?.episodeId || metadata?.episode) && <span>Episode: <span className="color-green">{metadata.episodeId || metadata.episode}</span></span>}
            {metadata?.seriesDescription && <span>Series: <span className="color-white">{metadata.seriesDescription}</span></span>}
            {metadata?.modality && <span>Modality: <span className="color-white">{metadata.modality}</span></span>}
          </div>
        </div>
      </div>

      {/* Body under navbar */}
      <div className="viewer-body">
        <CornerstoneViewer
          filename={filename}
          metadata={metadata}
          isAdmin={isAdmin}
          isPublic={isPublic}
          publicToken={publicToken}
          onFileBrowserToggle={handleFileBrowserToggle}
        />
      </div>

      <style jsx>{`
        .viewer-root { background-color: #0f172a; min-height: 100vh; }
        .viewer-navbar {
          position: fixed; top: 0; left: 0; right: 0; height: 64px;
          background-color: #1E2939; border-bottom: 1px solid #1f2937; z-index: 1100;
          color: #e5e7eb;
        }
        .viewer-navbar-patient-info {
          position: fixed; top: 64px; left: 0; right: 0; height: 48px;
          background-color: #101828; border-bottom: 1px solid #82878dff; z-index: 1100;
          color: #e5e7eb;
        }
        .navbar-inner { height: 100%; display: flex; align-items: center; padding: 0 16px; gap: 12px; }
        .navbar-title { font-weight: 500; letter-spacing: 0.01em; border-right: 1px solid #82878dff; padding-right: 16px; margin-right: 16px; }
        .navbar-meta { display: flex; align-items: center; gap: 14px; font-size: 14px; color: #99A1AF; }
        .navbar-meta span { display: inline-flex; gap: 4px; }
        .viewer-body { padding-top: 112px; }
        .color-white { color: #fff; }
        .color-green { color: #00D5BE; }
        .navbar-close {
          position: absolute;
          top: 12px;
          right: 12px;
          height: 36px;
          width: 36px;
          display: grid;
          place-items: center;
          background: transparent;
          color: #9ca3af;
          border: 1px solid rgba(156,163,175,0.25);
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
        }
        .navbar-close:hover {
          background: rgba(255,255,255,0.06);
          color: #e5e7eb;
          border-color: #4b5563;
        }
          @media screen and (max-width: 767px) {
              .hide-on-mobile {
                  display: none !important; /* !important can override other styles if necessary */
              }
          }
      `}</style>
    </div>
  );
}
