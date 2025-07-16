import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import DicomViewer from '../../components/DicomViewer';
import { useAuth } from '../../contexts/AuthContext';

export default function ViewerPage() {
  const router = useRouter();
  const { filename } = router.query;
  const [isClient, setIsClient] = useState(false);
  const { user, isAuthenticated, loading: authLoading } = useAuth();

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Validate patient access when filename and user are available
  useEffect(() => {
    if (!authLoading && isAuthenticated && user && filename) {
      console.log("masuk");
      // Check if filename contains patient ID (format: patientId/filename)
      if (filename.includes('/')) {
        const [patientIdFromPath] = filename.split('/');

        // Redirect to home if patient ID doesn't match logged-in user
        if (patientIdFromPath.split('_')?.[0] !== user.urn || (user.role && !user.role != "superadmin")) {
          console.warn('Patient ID mismatch:', patientIdFromPath, 'vs', user.urn);
          router.replace('/');
          return;
        }
      }
    }
  }, [filename, user, isAuthenticated, authLoading, router]);

  if (!isClient) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#1a1a1a',
        color: 'white'
      }}>
        Loading viewer...
      </div>
    );
  }

  if (!filename) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#1a1a1a',
        color: 'white',
        gap: '20px'
      }}>
        <h2>No DICOM file specified</h2>
        {/* <Link href="/"> */}
        <a style={{
          color: '#007bff',
          textDecoration: 'none',
          padding: '10px 20px',
          border: '1px solid #007bff',
          borderRadius: '4px'
        }}>
          ← Back to Gallery
        </a>
        {/* </Link> */}
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>DICOM Viewer - {filename}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      <div className="viewer-page">
        <div className="back-button">
          {/* <Link href="/"> */}
          <button className="btn btn-primary" onClick={() => router.replace('/')}>← Back to Gallery</button>
          {/* </Link> */}
        </div>

        <DicomViewer filename={filename} />
      </div>

      <style jsx global>{`
        body {
          margin: 0;
          padding: 0;
          background: #1a1a1a;
          font-family: Arial, sans-serif;
        }

        .viewer-page {
          height: 100vh;
          display: flex;
          flex-direction: column;
        }

        .back-button {
          position: absolute;
          top: 10px;
          right: 10px;
          z-index: 1000;
          margin-left: 350px; /* Account for sidebar */
        }

        .back-button a {
          background: rgba(0, 0, 0, 0.7);
          color: white;
          padding: 8px 16px;
          border-radius: 4px;
          text-decoration: none;
          font-size: 14px;
          transition: background 0.2s;
        }

        .back-button a:hover {
          background: rgba(0, 0, 0, 0.9);
        }
      `}</style>
    </>
  );
}
