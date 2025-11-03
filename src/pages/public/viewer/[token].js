import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import DicomViewer from '../../../components/DicomViewer';

export default function PublicViewer() {
  const router = useRouter();
  const { token } = router.query;
  const [filename, setFilename] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    const fetchStudy = async () => {
      try {
        setLoading(true);
        const base = process.env.NEXT_PUBLIC_APP_URL;
        const res = await fetch(`${base}/api/public/study/${encodeURIComponent(token)}`);
        if (!res.ok) {
          throw new Error('Invalid or expired link');
        }
        const data = await res.json();
        if (!data?.firstFile) throw new Error('Study has no starting file');
        setFilename(data.firstFile);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    fetchStudy();
  }, [token]);

  if (loading) return <div className="viewer-container"><div className="loading">Loading public study...</div></div>;
  if (error) return <div className="viewer-container"><div className="error">{error}</div></div>;

  return (
    <div className="viewer-container">
      {filename && (
        <DicomViewer filename={filename} isPublic={true} publicToken={token} />
      )}
    </div>
  );
}

