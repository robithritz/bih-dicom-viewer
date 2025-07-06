import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../components/Layout';
import Image from 'next/image';
import { useAuth } from '../contexts/AuthContext';

export default function AdminPortal() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [studies, setStudies] = useState({});
  const [error, setError] = useState(null);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });

  // Check authentication status
  useEffect(() => {
    checkAuthStatus();
  }, []);

  useEffect(() => {
    // Check for patient parameter in URL
    if (router.query.patient) {
      setSelectedPatient(router.query.patient);
    }
  }, [router.query.patient]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchStudies();
    }
  }, [selectedPatient, isAuthenticated]);

  const checkAuthStatus = async () => {
    try {
      const token = localStorage.getItem('admin-auth-token');
      if (!token) {
        setIsAuthenticated(false);
        setLoading(false);
        return;
      }

      const response = await fetch(process.env.NEXT_PUBLIC_APP_URL + '/api/admin/auth/me', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        setIsAuthenticated(true);
      } else {
        // Invalid token, remove it
        localStorage.removeItem('admin-auth-token');
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.error('Auth check error:', error);
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setError(null);

    try {
      const response = await fetch(process.env.NEXT_PUBLIC_APP_URL + '/api/admin/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(loginForm),
      });

      const data = await response.json();

      if (response.ok) {
        // Store token in localStorage
        if (data.token) {
          localStorage.setItem('admin-auth-token', data.token);
        }

        setUser(data.user);
        setIsAuthenticated(true);
        setLoginForm({ email: '', password: '' });
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (error) {
      console.error('Login error:', error);
      setError('Login failed. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      // Clear token from localStorage
      localStorage.removeItem('admin-auth-token');

      // Optional: Call logout API
      await fetch(process.env.NEXT_PUBLIC_APP_URL + '/api/admin/auth/logout', { method: 'POST' });

      setUser(null);
      setIsAuthenticated(false);
      setStudies({});
    } catch (error) {
      console.error('Logout error:', error);
      // Still clear state even if API call fails
      localStorage.removeItem('admin-auth-token');
      setUser(null);
      setIsAuthenticated(false);
      setStudies({});
    }
  };

  const fetchStudies = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('admin-auth-token');
      const url = selectedPatient
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/admin/studies?patient=${selectedPatient}`
        : `${process.env.NEXT_PUBLIC_APP_URL}/api/admin/studies`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch studies');
      }
      const data = await response.json();
      setStudies(data.studies);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Get unique patient IDs for filtering
  const getPatientIds = () => {
    const patientIds = new Set();
    Object.values(studies).forEach(study => {
      if (study.patientID) {
        patientIds.add(study.patientID);
      }
    });
    return Array.from(patientIds).sort();
  };

  const handlePatientFilter = (patientId) => {
    setSelectedPatient(patientId);
    if (patientId) {
      router.push(`/portal?patient=${patientId}`, undefined, { shallow: true });
    } else {
      router.push('/portal', undefined, { shallow: true });
    }
  };

  // Filter studies based on selected patient (admin can see all)
  const filteredStudies = selectedPatient
    ? Object.fromEntries(
      Object.entries(studies).filter(([_, study]) => study.patientID === selectedPatient)
    )
    : studies;

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-lg">Loading...</div>
        </div>
      </Layout>
    );
  }

  if (!isAuthenticated) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-md w-full space-y-8">
            <div>
              <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 items-center flex flex-col">
                <Image src={`${router.basePath}/images/bih-logo.png`} alt="Logo" width={200} height={80} />
                Admin Portal Login
              </h2>
              <p className="mt-2 text-center text-sm text-gray-600">
                Sign in to access the DICOM management system
              </p>
            </div>
            <form className="mt-8 space-y-6" onSubmit={handleLogin}>
              {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                  {error}
                </div>
              )}
              <div className="rounded-md shadow-sm -space-y-px">
                <div>
                  <input
                    type="email"
                    required
                    className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                    placeholder="Email address"
                    value={loginForm.email}
                    onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                  />
                </div>
                <div>
                  <input
                    type="password"
                    required
                    className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                    placeholder="Password"
                    value={loginForm.password}
                    onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <button
                  type="submit"
                  disabled={authLoading}
                  className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                  {authLoading ? 'Signing in...' : 'Sign in'}
                </button>
              </div>
            </form>
            {/* <div className="text-center">
              <Link href="/" className="text-indigo-600 hover:text-indigo-500">
                ← Back to Patient Portal
              </Link>
            </div> */}
          </div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="error">Error: {error}</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container">
        <div className="header">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                <Image src="/images/bih-logo.png" alt="Logo" width={200} height={80} />
                DICOM Viewer - Admin Portal
              </h1>
              <p className="text-white">Medical Image Viewer and Management System</p>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-white">
                Welcome, {user?.name} ({user?.role})
              </span>
              <button
                onClick={handleLogout}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </div>

        <div className="header-actions flex flex-wrap gap-4 items-center justify-between mb-6">
          <Link href="/admin/upload" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium">
            📁 Upload DICOM Files
          </Link>

          {/* {getPatientIds().length > 0 && (
            <div className="patient-filter flex items-center space-x-2">
              <label className="text-sm font-medium text-gray-700">Filter by Patient:</label>
              <select
                value={selectedPatient || ''}
                onChange={(e) => handlePatientFilter(e.target.value || null)}
                className="border border-gray-300 rounded-md px-3 py-1 text-sm"
              >
                <option value="">All Patients</option>
                {getPatientIds().map(patientId => (
                  <option key={patientId} value={patientId}>
                    {patientId}
                  </option>
                ))}
              </select>
            </div>
          )} */}

          {/* <Link href="/" className="text-indigo-600 hover:text-indigo-500 text-sm font-medium">
            Patient Portal →
          </Link> */}
        </div>

        {Object.keys(filteredStudies).length === 0 ? (
          <div className="no-studies">
            <h2>No DICOM studies found</h2>
            <p>Upload DICOM files to get started.</p>
            <Link href="/upload" className="upload-link">
              📁 Upload Files
            </Link>
          </div>
        ) : (
          <div className="studies-grid">
            {Object.entries(filteredStudies).map(([studyId, study]) => (
              <div key={studyId} className="study-card">
                <div className="study-thumbnail">
                  {study.thumbnail ? (
                    <img
                      src={`data:image/png;base64,${study.thumbnail}`}
                      alt="DICOM Preview"
                      className="thumbnail-image"
                    />
                  ) : (
                    <div className="thumbnail-placeholder">
                      📊 DICOM
                    </div>
                  )}
                </div>
                <div className="study-info">
                  <h3>{study.patientName || 'Unknown Patient'}</h3>
                  <div className="study-details">
                    <p><strong>Patient ID:</strong> {study.patientID || 'N/A'}</p>
                    <p><strong>Study Date:</strong> {study.studyDate || 'N/A'}</p>
                    <p><strong>Modality:</strong> {study.modality || 'N/A'}</p>
                    <p><strong>Description:</strong> {study.studyDescription || 'N/A'}</p>
                    <p><strong>Files:</strong> {study.files?.length || 0}</p>
                    <p><strong>Series:</strong> {Object.keys(study.series || {}).length}</p>
                  </div>
                  <Link
                    href={`/admin/viewer/${encodeURIComponent(study.firstFile)}`}
                    className="view-button"
                  >
                    View Study
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
