import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Head from 'next/head';
import DicomViewer from '../../../components/DicomViewer';
import { useAuth } from '../../../contexts/AuthContext';

export default function AdminViewerPage() {
  const router = useRouter();
  const { filename } = router.query;
  const [isClient, setIsClient] = useState(false);
  const { user, isAuthenticated, loading: authLoading } = useAuth();

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Check if user is admin
  useEffect(() => {
    console.log("kesini", { authLoading, isAuthenticated, user });
    if (!authLoading && (!isAuthenticated || !user || user.role !== 'superadmin')) {
      router.replace('/portal');
      return;
    }
  }, [user, isAuthenticated, authLoading, router]);

  if (!isClient || authLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#1a1a1a',
        color: 'white'
      }}>
        Loading admin viewer...
      </div>
    );
  }

  if (!isAuthenticated || !user || user.role !== 'superadmin') {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#1a1a1a',
        color: 'white'
      }}>
        Access denied. Admin privileges required.
      </div>
    );
  }

  if (!filename) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#1a1a1a',
        color: 'white'
      }}>
        No file specified
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Admin DICOM Viewer - {filename}</title>
        <meta name="description" content="Admin DICOM Medical Image Viewer" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div style={{
        width: '100vw',
        height: '100vh',
        background: '#1a1a1a',
        overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          zIndex: 1000
        }}>
          <button
            onClick={() => router.back()}
            className="btn btn-primary"
          >
            ← Back to Portal
          </button>
        </div>

        <DicomViewer
          filename={filename}
          isAdmin={true}
        />
      </div>
    </>
  );
}
