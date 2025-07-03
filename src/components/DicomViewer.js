import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import cornerstone to avoid SSR issues
const CornerstoneViewer = dynamic(() => import('./CornerstoneViewer'), {
  ssr: false,
  loading: () => <div>Loading DICOM viewer...</div>
});

export default function DicomViewer({ filename }) {
  const [metadata, setMetadata] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (filename) {
      fetchMetadata();
    }
  }, [filename]);

  const fetchMetadata = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/dicom-info/${filename}`);
      if (!response.ok) {
        throw new Error('Failed to fetch DICOM metadata');
      }
      const data = await response.json();
      setMetadata(data);
    } catch (err) {
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

      <CornerstoneViewer filename={filename} metadata={metadata} />


    </div>
  );
}
