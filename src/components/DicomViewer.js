import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';

// Dynamically import cornerstone to avoid SSR issues
const CornerstoneViewer = dynamic(() => import('./CornerstoneViewer'), {
  ssr: false,
  loading: () => <div>Loading DICOM viewer...</div>
});

export default function DicomViewer({ filename, isAdmin = false }) {
  const [metadata, setMetadata] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const router = useRouter();

  useEffect(() => {
    if (filename) {
      fetchMetadata();
    }
  }, [filename]);

  const fetchMetadata = async () => {
    try {
      setLoading(true);
      const apiPath = isAdmin
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/admin/dicom-info/${encodeURIComponent(filename)}`
        : `${process.env.NEXT_PUBLIC_APP_URL}/api/dicom-info/${encodeURIComponent(filename)}`;

      const token = isAdmin ? `Bearer ${localStorage.getItem('admin-auth-token')}` : `Bearer ${localStorage.getItem('auth-token')}`
      console.log("token", apiPath, token);

      const response = await fetch(apiPath, {
        headers: {
          'Authorization': token
        }
      });
      if (!response.ok) {
        if (response.status == 401) {
          router.replace(isAdmin ? '/portal' : '/login');
        }
        throw new Error('Failed to fetch DICOM metadata', response);
      }
      const data = await response.json();
      setMetadata(data);
    } catch (err) {
      console.log(err);
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
    <div className="viewer-container">
      <div className="viewer-header">
        <h2>🏥 DICOM Viewer - {filename}</h2>
        <div className="metadata-summary">
          <span>Patient: {metadata?.patientName}</span>
          <span>Study: {metadata?.studyDescription}</span>
          <span>Series: {metadata?.seriesDescription}</span>
          <span>Modality: {metadata?.modality}</span>
        </div>
      </div>

      <CornerstoneViewer filename={filename} metadata={metadata} isAdmin={isAdmin} />


    </div>
  );
}
