import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useAuth } from '../contexts/AuthContext';
import Image from 'next/image';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('email'); // 'email' or 'otp'
  const [sessionId, setSessionId] = useState('');
  const [expiresAt, setExpiresAt] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [maxRetries, setMaxRetries] = useState(5);
  const [timeLeft, setTimeLeft] = useState(0);
  const [loginMode, setLoginMode] = useState(''); // 'otp' | 'urn'
  const [urnCombined, setUrnCombined] = useState(''); // "URN and last 4 digits of ID"
  const [urnNumber, setUrnNumber] = useState('');
  const [idLast4, setIdLast4] = useState('');
  // Custom dropdown (select login method)
  const selectRef = useRef(null);
  const [selectOpen, setSelectOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1); // 0: Email, 1: URN
  const [confirmSwitchOpen, setConfirmSwitchOpen] = useState(false);
  const [pendingLoginMode, setPendingLoginMode] = useState('');

  const optionList = [
    { value: 'otp', label: 'Email' },
    { value: 'urn', label: 'URN' },
  ];

  const labelForValue = (val) => (val === 'otp' ? 'Email' : val === 'urn' ? 'URN' : 'Select login method');

  const handleSelectLoginMode = (val) => {
    setLoginMode(val);
    setError('');
    setSuccess('');
    setStep('email');
    setUrnCombined('');
    setUrnNumber('');
    setIdLast4('');
    setSelectOpen(false);
  };

  const requestSwitchLoginMode = (val) => {
    // If user is in OTP verification step and wants to switch to URN, confirm first
    if (loginMode === 'otp' && step === 'otp' && val === 'urn') {
      setPendingLoginMode(val);
      setSelectOpen(false);
      setConfirmSwitchOpen(true);
      return;
    }
    handleSelectLoginMode(val);
  };

  const confirmSwitch = () => {
    // Clear OTP-related state and switch
    setOtp('');
    setSessionId('');
    setExpiresAt(null);
    setTimeLeft(0);
    setRetryCount(0);
    setError('');
    setSuccess('');
    setStep('email');
    setUrnCombined('');
    setUrnNumber('');
    setIdLast4('');
    setLoginMode(pendingLoginMode || 'urn');
    setPendingLoginMode('');
    setConfirmSwitchOpen(false);
  };

  const cancelSwitch = () => {
    setPendingLoginMode('');
    setConfirmSwitchOpen(false);
  };

  const onSelectKeyDown = (e) => {
    const max = optionList.length - 1;
    if (!selectOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setSelectOpen(true);
        setHighlightIndex(loginMode === 'urn' ? 1 : 0);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((i) => (i < max ? i + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((i) => (i > 0 ? i - 1 : max));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const choice = optionList[Math.max(0, highlightIndex)]?.value || optionList[0].value;
      handleSelectLoginMode(choice);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setSelectOpen(false);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const onDocClick = (e) => {
      if (selectRef.current && !selectRef.current.contains(e.target)) {
        setSelectOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);


  const { isAuthenticated, loading: authLoading, checkAuth, setUserData } = useAuth();
  const router = useRouter();

  // Redirect if already authenticated
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, authLoading, router]);

  // Countdown timer for OTP expiration
  useEffect(() => {
    let interval;

    if (expiresAt && step === 'otp') {
      interval = setInterval(() => {
        const now = Date.now();
        const remaining = Math.max(0, expiresAt - now);
        setTimeLeft(remaining);

        if (remaining <= 0) {
          clearInterval(interval);
        }
      }, 1000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [expiresAt, step]);

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await fetch(process.env.NEXT_PUBLIC_APP_URL + '/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (data.success) {
        setSessionId(data.sessionId);
        setExpiresAt(data.expiresAt);
        setRetryCount(data.retryCount);
        setMaxRetries(data.maxRetries);
        setTimeLeft(data.expiresAt - Date.now()); // Initialize countdown
        setStep('otp');
        setSuccess('Verification code sent to your email');
      } else {
        setError(data.error);
      }
    } catch (error) {
      setError('Failed to send verification code. Please try again.');
    }

    setLoading(false);
  };

  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    console.log('Submitting OTP verification:', { email, otp: otp ? '***' : undefined, sessionId });

    try {
      const response = await fetch(process.env.NEXT_PUBLIC_APP_URL + '/api/auth/verify-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, otp, sessionId }),
      });

      const data = await response.json();

      if (data.success) {
        // Store token in localStorage
        if (data.token) {
          localStorage.setItem('auth-token', data.token);
        }

        // Set user data directly from the response instead of calling checkAuth
        if (data.patient) {
          setUserData(data.patient);
        }

        // Redirect to home page
        router.replace('/');
      } else {
        setError(data.error);
      }
    } catch (error) {
      setError('Verification failed. Please try again.');
    }

    setLoading(false);
  };

  const handleResendOtp = async () => {
    // Check if current OTP is still valid
    if (timeLeft > 0) {
      setError(`Please wait ${formatTimeLeft(timeLeft)} before requesting a new code`);
      return;
    }

    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await fetch(process.env.NEXT_PUBLIC_APP_URL + '/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (data.success) {
        setSessionId(data.sessionId);
        setExpiresAt(data.expiresAt);
        setRetryCount(data.retryCount);
        setMaxRetries(data.maxRetries);
        setTimeLeft(data.expiresAt - Date.now()); // Reset countdown
        setSuccess('New verification code sent to your email');
        setOtp(''); // Clear previous OTP
      } else {
        setError(data.error);
      }
    } catch (error) {
      setError('Failed to resend verification code. Please try again.');
    }

    setLoading(false);
  };

  const handleBackToEmail = () => {
    setStep('email');
    setOtp('');

    setSessionId('');
    setError('');
    setSuccess('');
  };

  // Format time remaining as MM:SS
  const formatTimeLeft = (milliseconds) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleUrnLoginSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      // Combine URN number + last4 without separator
      const combined = `${(urnNumber || '').trim()}${(idLast4 || '').trim()}`;
      if (!combined || (idLast4 || '').length !== 4) {
        setLoading(false);
        setError('Please enter your URN and the last 4 digits of your ID');
        return;
      }

      const response = await fetch(process.env.NEXT_PUBLIC_APP_URL + '/api/auth/login-urn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ combined }),
      });

      const data = await response.json();
      if (data.success) {
        if (data.token) {
          localStorage.setItem('auth-token', data.token);
        }
        if (data.patient) {
          setUserData(data.patient);
        }
        router.replace('/');
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (err) {
      setError('Login failed. Please try again.');
    }

    setLoading(false);
  };

  if (authLoading) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="logo-wrap">
            <Image src={`${router.basePath}/images/bih-logo.png`} alt="Bali International Hospital" width={220} height={82} />
          </div>
          <h1 className="product-title">Dicom Viewer</h1>
          <p className="product-sub">Access your medical imaging results</p>
        </div>

        <div className="login-label">Select Login Type</div>

        {/* Login method selection (custom dropdown to match mock) */}
        <div className="login-select">
          <div className="custom-select" ref={selectRef}>
            <button
              type="button"
              className="custom-select-button"
              aria-haspopup="listbox"
              aria-expanded={selectOpen}
              aria-controls="login-mode-listbox"
              onClick={() => setSelectOpen((o) => !o)}
              onKeyDown={(e) => {
                if (!selectOpen && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
                  e.preventDefault();
                  setSelectOpen(true);
                  setHighlightIndex(loginMode === 'urn' ? 1 : 0);
                } else if (selectOpen) {
                  const max = optionList.length - 1;
                  if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIndex((i) => (i < max ? i + 1 : 0)); }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIndex((i) => (i > 0 ? i - 1 : max)); }
                  else if (e.key === 'Enter') { e.preventDefault(); requestSwitchLoginMode(optionList[Math.max(0, highlightIndex)]?.value || optionList[0].value); }
                  else if (e.key === 'Escape') { e.preventDefault(); setSelectOpen(false); }
                }
              }}
            >
              <span>{labelForValue(loginMode)}</span>
              <span className="select-chevron" aria-hidden>▾</span>
            </button>
            {selectOpen && (
              <div id="login-mode-listbox" role="listbox" className="custom-select-menu">
                <div
                  role="option"
                  aria-selected={loginMode === 'otp'}
                  className={`custom-select-option ${highlightIndex === 0 ? 'active' : ''} ${loginMode === 'otp' ? 'selected' : ''}`}
                  onMouseEnter={() => setHighlightIndex(0)}
                  onClick={() => requestSwitchLoginMode('otp')}
                >
                  Email
                </div>
                <div
                  role="option"
                  aria-selected={loginMode === 'urn'}
                  className={`custom-select-option ${highlightIndex === 1 ? 'active' : ''} ${loginMode === 'urn' ? 'selected' : ''}`}
                  onMouseEnter={() => setHighlightIndex(1)}
                  onClick={() => requestSwitchLoginMode('urn')}
                >
                  URN
                </div>
              </div>
            )}
          </div>
        </div>

        {loginMode === 'otp' ? (
          step === 'email' ? (
            <form onSubmit={handleEmailSubmit} className="auth-form">
              {error && (<div className="error-message">{error}</div>)}
              {success && (<div className="success-message">{success}</div>)}

              <div className="form-group">
                <label htmlFor="email">Email Address</label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  placeholder="Enter your email"
                />
              </div>

              <button type="submit" className="auth-button" disabled={loading}>
                {loading ? 'Sending...' : 'Send OTP'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleOtpSubmit} className="auth-form">
              {error && (<div className="error-message">{error}</div>)}

              <div className="form-group">
                <label htmlFor="emailDisplay">Email Address</label>
                <input
                  type="email"
                  id="emailDisplay"
                  value={email}
                  readOnly
                  disabled
                />
              </div>

              <div className="form-group">
                <label htmlFor="otp">OTP Code</label>
                <input
                  type="text"
                  id="otp"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  disabled={loading}
                  placeholder="000000"
                  maxLength="6"
                />
              </div>

              <button
                type="button"
                className="change-email-link"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setTimeout(handleBackToEmail, 0); }}
                disabled={loading}
              >
                Use different email
              </button>
              <div className="hint-text">Please check your email for the OTP code</div>

              <button type="submit" className="auth-button" disabled={loading || otp.length !== 6}>
                {loading ? 'Submitting...' : 'Submit'}
              </button>
            </form>
          )
        ) : loginMode === 'urn' ? (
          <form onSubmit={handleUrnLoginSubmit} className="auth-form">
            {error && (<div className="error-message">{error}</div>)}
            {success && (<div className="success-message">{success}</div>)}

            <div className="form-group">
              <label htmlFor="urnNumber">URN Number</label>
              <input
                type="text"
                id="urnNumber"
                value={urnNumber}
                onChange={(e) => setUrnNumber(e.target.value)}
                required
                disabled={loading}
                placeholder="Enter your URN number"
              />
            </div>

            <div className="form-group">
              <label htmlFor="idLast4">Last 4 Digits of Identity ID</label>
              <input
                type="text"
                id="idLast4"
                inputMode="numeric"
                value={idLast4}
                onChange={(e) => setIdLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                maxLength="4"
                required
                disabled={loading}
                placeholder="****"
              />
            </div>

            <button type="submit" className="auth-button" disabled={loading || !urnNumber || idLast4.length !== 4}>
              {loading ? 'Submitting...' : 'Submit'}
            </button>
          </form>
        ) : null}

        {/* <div className="auth-footer">
          <p>
            Don't have an account?{' '}
            <Link href="/register" className="auth-link">
              Register here
            </Link>
          </p>
          <p>
            <Link href="/portal" className="auth-link">
              ← Admin Portal
            </Link>
          </p>
        </div> */}
      </div>

      {confirmSwitchOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="switch-login-title">
          <div className="modal-card">
            <div className="modal-body">
              <div className="modal-icon">!</div>
              <div>
                <h3 id="switch-login-title" className="modal-title">Switch Login Method?</h3>
                <p className="modal-text">You have already sent an OTP to your email.</p>
                <p className="modal-text">Switching will clear your current progress and you will need to start over.</p>
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-outline" onClick={cancelSwitch}>Cancel</button>
              <button type="button" className="btn-primary" onClick={confirmSwitch}>Switch Method</button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .auth-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          /* Figma-like soft gradient background */
          background: linear-gradient(180deg, #D4E8F1 0%, #E1F0E8 50%, #DAECD9 100%);
          padding: 20px;
        }

        .auth-card {
          background: white;
          border-radius: 12px;
          box-shadow: 0 12px 40px rgba(15, 23, 42, 0.12), 0 3px 10px rgba(15, 23, 42, 0.06);
          padding: 44px 40px;
          width: 100%;
          max-width: 560px;
        }

        .auth-header {
          text-align: left;
          margin-bottom: 28px;
        }

        .logo-wrap {
          display: flex;
          justify-content: center;
          margin-bottom: 10px;
        }

        .product-title {
          margin: 0 0 6px 0;
          color: #1D5A8A;
          font-size: 24px;
          font-weight: 700;
        }

        .product-sub {
          margin: 0 0 18px 0;
          color: #6b7280; /* slate-500 */
          font-size: 14px;
        }

        .auth-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .form-group label {
          font-weight: 600;
          color: #333;
          font-size: 14px;
        }

        .form-group input {
          padding: 12px;
          border: 2px solid #e5e7eb; /* gray-200 to match select */
          border-radius: 10px;
          font-size: 16px;
          background-color: #fff;
          color: #111827; /* gray-900 */
          transition: border-color 0.2s, box-shadow 0.2s, background-color 0.2s;
        }

        .form-group input:focus {
          outline: none;
          border-color: #1f6db2; /* theme blue */
          box-shadow: 0 0 0 3px rgba(31, 109, 178, 0.15);
        }

        .form-group input::placeholder {
          color: #9ca3af; /* gray-400 */
        }

        .form-group input:disabled {
          background-color: #f5f5f5;
          cursor: not-allowed;
        }

        .auth-button {
          background: #4A90C5;
          color: white;
          border: none;
          padding: 14px;
          border-radius: 10px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 0.2s, box-shadow 0.2s, transform 0.15s;
        }

        .auth-button:hover:not(:disabled) {
          background: #3e8bc5ff; /* darken on hover */
          transform: translateY(-1px);
          box-shadow: 0 6px 18px rgba(31, 109, 178, 0.35);
        }

        .auth-button:focus-visible {
          outline: none;
          box-shadow: 0 0 0 3px rgba(31, 109, 178, 0.25);
        }

        .auth-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        .error-message {
          background-color: #fee;
          color: #c33;
          padding: 12px;
          border-radius: 6px;
          border: 1px solid #fcc;
          font-size: 14px;
        }

        .success-message {
          background-color: #efe;
          color: #363;
          padding: 12px;
          border-radius: 6px;
          border: 1px solid #cfc;
          font-size: 14px;
        }

        .otp-info {
          text-align: center;
          margin-bottom: 20px;
          padding: 15px;
          background-color: #f8f9fa;
          border-radius: 6px;
          border: 1px solid #e9ecef;
        }

        .otp-info p {
          margin: 5px 0;
          color: #666;
          font-size: 14px;
        }

        .otp-info strong {
          color: #333;
          font-size: 16px;
        }

        .otp-expires {
          color: #e74c3c !important;
          font-weight: 500;
        }

        /* OTP input now standard field, no special tracking styling */

        .change-email-link {
          background: transparent;
          color: #1f6db2;
          border: none;
          padding: 0;
          margin: 2px 0 6px 0;
          text-align: left;
          font-size: 14px;
          cursor: pointer;
        }

        .change-email-link:hover { text-decoration: underline; }

        .hint-text {
          color: #22a055; /* green hint */
          font-size: 14px;
          margin-bottom: 8px;
        }

        .resend-button, .back-button {
          background: transparent;
          color: #1f6db2;
          border: 1px solid #1f6db2;
          padding: 10px 12px;
          border-radius: 10px;
          font-size: 14px;
          cursor: pointer;
          transition: background-color 0.2s, color 0.2s, box-shadow 0.2s;
        }

        .resend-button:hover:not(:disabled), .back-button:hover:not(:disabled) {
          background-color: #1f6db2;
          color: #fff;
          box-shadow: 0 4px 12px rgba(31, 109, 178, 0.25);
        }

        .resend-button:disabled, .back-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .login-label {
          text-align: left;
          font-weight: 600;
          color: #364153; /* gray-800 */
          margin: 6px 0 8px 0;
        }

        /* Centered, full-width dropdown */
        .login-select {
          margin: 10px 0 20px 0;
          width: 100%;
        }
        .custom-select { position: relative; width: 100%; }
        .custom-select-button {
          width: 100%; text-align: left;
          padding: 16px 44px 16px 16px;
          border: 2px solid #4A90C5;
          border-radius: 12px;
          background: #fff; color: #111827;
          font-size: 16px; font-weight: 500;
          cursor: pointer;
          transition: border-color .2s, box-shadow .2s, background-color .2s;
          position: relative;
        }
        .custom-select-button:hover { border-color: #3f86be; }
        .custom-select-button:focus-visible {
          outline: none; border-color: #4A90C5;
          box-shadow: 0 0 0 3px rgba(74,144,197,.20);
        }
        .custom-select-menu {
          position: absolute; left: 0; right: 0; top: calc(100% + 6px);
          background: #fff; border: 1px solid #e5e7eb; border-radius: 12px;
          box-shadow: 0 10px 30px rgba(15,23,42,.12), 0 3px 10px rgba(15,23,42,.06);
          overflow: hidden; z-index: 50;
        }
        .custom-select-option { padding: 16px; cursor: pointer; color: #111827; }
        .custom-select-option:hover, .custom-select-option.active {
          background: #e8f3fb; color: #1D5A8A;
        }
        .custom-select-option.selected { font-weight: 600; }
        .select-chevron {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          pointer-events: none;
          color: #98A2B3; /* neutral chevron like mock */
          font-size: 16px;
          line-height: 1;
        }

        /* Modal styles for switch confirmation */
        .modal-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.65);
          display: flex; align-items: center; justify-content: center;
          padding: 20px; z-index: 100;
        }
        .modal-card {
          background: #fff; border-radius: 12px; width: 100%; max-width: 520px;
          box-shadow: 0 20px 48px rgba(0,0,0,.35);
          border: 1px solid #e3eef6;
        }
        .modal-body {
          padding: 22px 24px 12px; display: flex; gap: 12px; align-items: flex-start;
        }
        .modal-icon {
          width: 32px; height: 32px; border-radius: 50%;
          background: #FFF6ED; color: #F97316; /* orange */
          display: inline-flex; align-items: center; justify-content: center;
          font-weight: 700; border: 1px solid #FED7AA;
        }
        .modal-title { margin: 0 0 6px 0; font-size: 16px; font-weight: 700; color: #111827; }
        .modal-text { margin: 0; font-size: 14px; color: #4B5563; line-height: 1.45; }
        .modal-actions { display: flex; justify-content: flex-end; gap: 10px; padding: 8px 24px 18px; }
        .btn-outline { background: #fff; color: #111827; border: 1px solid #d1d5db; padding: 10px 14px; border-radius: 8px; cursor: pointer; }
        .btn-outline:hover { background: #f9fafb; }
        .btn-primary { background: #4A90C5; color: #fff; border: none; padding: 10px 14px; border-radius: 8px; cursor: pointer; }
        .btn-primary:hover { background: #3e8bc5ff; }

        .login-tab {
          flex: 1;
          background: transparent;
          color: #667eea;
          border: 1px solid #667eea;
          padding: 10px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .login-tab.active {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
        }

        .auth-footer p {
          margin: 8px 0;
          font-size: 14px;
          color: #666;
        }

        .auth-link {
          color: #667eea;
          text-decoration: none;
          font-weight: 500;
        }

        .auth-link:hover {
          text-decoration: underline;
        }

        @media (max-width: 480px) {
          .auth-card {
            padding: 30px 20px;
          }
          .login-select-control {
            max-width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
