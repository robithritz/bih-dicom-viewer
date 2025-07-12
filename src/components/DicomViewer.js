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

      console.log("🔍 FETCHING METADATA:", {
        filename: filename,
        apiPath: apiPath,
        isAdmin: isAdmin,
        token: token ? 'Present' : 'Missing'
      });

      const response = await fetch(apiPath, {
        headers: {
          'Authorization': token
        }
      });

      console.log("🔍 API RESPONSE:", {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });

      if (!response.ok) {
        console.error("❌ API ERROR:", {
          status: response.status,
          statusText: response.statusText,
          url: apiPath
        });

        if (response.status == 401) {
          router.replace(isAdmin ? '/portal' : '/login');
        }
        throw new Error(`Failed to fetch DICOM metadata: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();

      // Enhanced debugging for frame detection
      console.log('🔍 DicomViewer received metadata:', {
        filename: filename,
        numberOfFrames: data.numberOfFrames,
        isAdmin: isAdmin,
        fullMetadata: data
      });

      // Special logging for the problematic file
      if (filename.includes('IM-0004-0001.dcm')) {
        console.log('🚨 PROBLEMATIC FILE DETECTED:', {
          filename: filename,
          numberOfFrames: data.numberOfFrames,
          expectedFrames: 'Should be > 1 for 16MB file',
          metadata: data
        });
      }

      setMetadata(data);

      // Additional test for the problematic file
      if (filename.includes('IM-0004-0001.dcm')) {
        console.log("🧪 TESTING DIRECT DICOM ACCESS for problematic file...");
        testDirectDicomAccess();
      }

    } catch (err) {
      console.error("❌ FETCH ERROR:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Test function to directly access DICOM file
  const testDirectDicomAccess = async () => {
    try {
      const directApiPath = isAdmin
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/admin/dicom-file/${encodeURIComponent(filename)}`
        : `${process.env.NEXT_PUBLIC_APP_URL}/api/dicom-file/${encodeURIComponent(filename)}`;

      console.log("🧪 Testing direct DICOM file access:", directApiPath);

      const token = isAdmin ? `Bearer ${localStorage.getItem('admin-auth-token')}` : `Bearer ${localStorage.getItem('auth-token')}`;
      const response = await fetch(directApiPath, {
        headers: { 'Authorization': token }
      });

      if (response.ok) {
        const blob = await response.blob();
        console.log("🧪 Direct DICOM file access successful:", {
          size: blob.size,
          type: blob.type,
          sizeInMB: (blob.size / 1024 / 1024).toFixed(2) + ' MB'
        });

        // If it's really 16MB, this should confirm the file size
        if (blob.size > 10 * 1024 * 1024) { // > 10MB
          console.log("✅ CONFIRMED: Large file detected, should have multiple frames");
        }
      } else {
        console.error("❌ Direct DICOM file access failed:", response.status);
      }
    } catch (error) {
      console.error("❌ Direct DICOM test error:", error);
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
