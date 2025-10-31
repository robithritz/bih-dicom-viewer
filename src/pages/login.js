import { useState, useEffect } from 'react';
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
  const [urn, setUrn] = useState('');
  const [dob, setDob] = useState(''); // as password


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
      const response = await fetch(process.env.NEXT_PUBLIC_APP_URL + '/api/auth/login-urn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urn, dob }),
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
          <h2 className="flex justify-between items-center">
            <Image src={`${router.basePath}/images/bih-logo.png`} alt="Logo" width={200} height={80} />
            Patient Login
          </h2>
          <h1>
            Dicom Viewer
          </h1>
          <p>Access your medical imaging results</p>

        </div>

        <div className="login-label">Select Login Type</div>

        {/* Login method switch */}
        <div className="login-switch">
          <button
            type="button"
            className={`login-tab ${loginMode === 'otp' ? 'active' : ''}`}
            onClick={() => { setLoginMode('otp'); setError(''); setSuccess(''); setStep('email'); }}
          >
            Email
          </button>
          <button
            type="button"
            className={`login-tab ${loginMode === 'urn' ? 'active' : ''}`}
            onClick={() => { setLoginMode('urn'); setError(''); setSuccess(''); setStep('email'); }}
          >
            URN
          </button>
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
                  placeholder="Enter your registered email"
                />
              </div>

              <button type="submit" className="auth-button" disabled={loading}>
                {loading ? 'Sending Code...' : 'Send Verification Code'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleOtpSubmit} className="auth-form">
              {error && (<div className="error-message">{error}</div>)}
              {success && (<div className="success-message">{success}</div>)}

              <div className="otp-info">
                <p>We've sent a 6-digit verification code to:</p>
                <strong>{email}</strong>
                <p className="otp-expires">
                  {timeLeft > 0 ? (
                    <>Code expires in {formatTimeLeft(timeLeft)}</>
                  ) : (
                    <span style={{ color: '#e74c3c' }}>Code has expired</span>
                  )}
                </p>
              </div>

              <div className="form-group">
                <label htmlFor="otp">Verification Code</label>
                <input
                  type="text"
                  id="otp"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  disabled={loading}
                  placeholder="Enter OTP"
                  maxLength="6"
                  className="otp-input"
                />
              </div>

              <button type="submit" className="auth-button" disabled={loading || otp.length !== 6}>
                {loading ? 'Verifying...' : 'Verify & Sign In'}
              </button>

              <div className="otp-actions">
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={loading || retryCount >= maxRetries || timeLeft > 0}
                  className="resend-button"
                  title={timeLeft > 0 ? `Wait ${formatTimeLeft(timeLeft)} before resending` : ''}
                >
                  {loading ? 'Sending...' :
                    timeLeft > 0 ? `Resend Code in ${formatTimeLeft(timeLeft)}` :
                      `Resend Code (${retryCount}/${maxRetries})`}
                </button>
              </div>
            </form>
          )
        ) : loginMode === 'urn' ? (
          <form onSubmit={handleUrnLoginSubmit} className="auth-form">
            {error && (<div className="error-message">{error}</div>)}
            {success && (<div className="success-message">{success}</div>)}

            <div className="form-group">
              <label htmlFor="urn">URN</label>
              <input
                type="text"
                id="urn"
                value={urn}
                onChange={(e) => setUrn(e.target.value)}
                required
                disabled={loading}
                placeholder="Enter your URN"
              />
            </div>

            <div className="form-group">
              <label htmlFor="dob">Date of Birth (DDMMYYYY)</label>
              <input
                type="password"
                id="dob"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                required
                disabled={loading}
                placeholder="e.g. DDMMYYYY"
              />
            </div>

            <button type="submit" className="auth-button" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
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

      <style jsx>{`
        .auth-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          padding: 20px;
        }

        .auth-card {
          background: white;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
          padding: 40px;
          width: 100%;
          max-width: 400px;
        }

        .auth-header {
          text-align: center;
          margin-bottom: 30px;
        }

        .auth-header h1 {
          margin: 0 0 10px 0;
          color: #333;
          font-size: 28px;
        }

        .auth-header p {
          margin: 0;
          color: #666;
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
          border: 2px solid #ddd;
          border-radius: 6px;
          font-size: 16px;
          transition: border-color 0.2s;
        }

        .form-group input:focus {
          outline: none;
          border-color: #667eea;
        }

        .form-group input:disabled {
          background-color: #f5f5f5;
          cursor: not-allowed;
        }

        .auth-button {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          padding: 14px;
          border-radius: 6px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .auth-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
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

        .otp-input {
          text-align: center;
          font-size: 24px;
          font-weight: bold;
          letter-spacing: 8px;
          font-family: monospace;
        }

        .otp-actions {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: 15px;
        }

        .resend-button, .back-button {
          background: transparent;
          color: #667eea;
          border: 1px solid #667eea;
          padding: 10px;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .resend-button:hover:not(:disabled), .back-button:hover:not(:disabled) {
          background-color: #667eea;
          color: white;
        }

        .resend-button:disabled, .back-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .login-label {
          text-align: center;
          font-weight: 600;
          color: #333;
          margin: 0 0 8px 0;
        }


        .login-switch {
          display: flex;
          gap: 10px;
          margin: 10px 0 20px 0;
        }

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
        }
      `}</style>
    </div>
  );
}
