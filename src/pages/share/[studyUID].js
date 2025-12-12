import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';

export default function ShareStudy() {
  const router = useRouter();
  const { studyUID } = router.query;
  const { isAuthenticated, loading: authLoading } = useAuth();

  const [duration, setDuration] = useState('1w');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/studies/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth-token')}`
        },
        body: JSON.stringify({ studyInstanceUID: studyUID, duration })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to create share');
      setShareUrl(data.shareUrl);
      setExpiresAt(data.expiresAt);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      alert('Link copied to clipboard');
    } catch {}
  };

  if (authLoading) return <div className="container"><div className="loading">Loading...</div></div>;
  if (!isAuthenticated) return null;

  return (
    <div className="container" style={{ maxWidth: 760, margin: '40px auto', color: '#eee' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>Share Study Publicly</h1>
      <div style={{ background: '#1f2937', padding: 20, borderRadius: 8, border: '1px solid #374151' }}>
        <p style={{ marginBottom: 12 }}>
          Please read and accept the Terms & Conditions before sharing this study publicly.
        </p>
        <div style={{ maxHeight: 160, overflowY: 'auto', padding: 12, background: '#111827', borderRadius: 6, fontSize: 13, lineHeight: 1.5 }}>
          <p><strong>Terms & Conditions</strong></p>
          <ul style={{ marginLeft: 16 }}>
            <li>The link grants read-only access to this study's DICOM files.</li>
            <li>Anyone with the link can view until it expires.</li>
            <li>You can stop sharing anytime by requesting revocation from support.</li>
            <li>Do not share sensitive patient-identifiable details outside the viewer.</li>
          </ul>
        </div>

        <form onSubmit={handleSubmit} style={{ marginTop: 16 }}>
          <label style={{ display: 'block', marginBottom: 8 }}>Share duration</label>
          <select value={duration} onChange={(e) => setDuration(e.target.value)} style={{
            background: '#111827', color: '#fff', padding: '8px 12px', borderRadius: 6, border: '1px solid #374151'
          }}>
            <option value="1w">1 week</option>
            <option value="1m">1 month</option>
          </select>

          <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
            <button type="button" onClick={() => router.back()} style={{
              background: 'transparent', color: '#a1a1aa', border: '1px solid #4b5563', padding: '8px 14px', borderRadius: 6
            }}>Cancel</button>
            <button type="submit" disabled={submitting} style={{
              background: 'linear-gradient(135deg,#667eea 0%,#764ba2 100%)', color: '#fff', padding: '8px 14px', borderRadius: 6, border: 'none'
            }}>
              {submitting ? 'Creating link...' : 'Create Share Link'}
            </button>
          </div>
        </form>

        {error && <div style={{ color: '#f87171', marginTop: 12 }}>{error}</div>}

        {shareUrl && (
          <div style={{ marginTop: 18 }}>
            <div style={{ marginBottom: 6 }}>Public link (expires {new Date(expiresAt).toLocaleString()}):</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input readOnly value={shareUrl} style={{ flex: 1, background: '#111827', color: '#fff', padding: '8px 12px', borderRadius: 6, border: '1px solid #374151' }} />
              <button onClick={copyLink} style={{ background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 12px' }}>Copy</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

