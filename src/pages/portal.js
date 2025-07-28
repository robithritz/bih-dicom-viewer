import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../components/Layout';
import Image from 'next/image';
import { useAuth } from '../contexts/AuthContext';

export default function AdminPortal() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authContextLoading, setUserData, logout: authLogout, refreshAuth } = useAuth();
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [studies, setStudies] = useState({});
  const [error, setError] = useState(null);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });

  // Search and pagination state
  const [searchQuery, setSearchQuery] = useState('');
  const [oldSearchQuery, setoldSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState(''); // For immediate UI updates
  const [currentPage, setCurrentPage] = useState(1);
  const [studiesPerPage] = useState(10); // Number of studies per page
  const [paginationInfo, setPaginationInfo] = useState({
    totalPages: 0,
    totalStudies: 0,
    hasNextPage: false,
    hasPrevPage: false
  });

  // Check for patient parameter in URL
  useEffect(() => {
    if (router.query.patient) {
      setSelectedPatient(router.query.patient);
    }
  }, [router.query.patient]);

  // Fetch studies when authenticated or when page changes (but not when search/patient changes as they reset page)
  useEffect(() => {
    if (isAuthenticated) {

      if (searchQuery !== oldSearchQuery) {
        setoldSearchQuery(searchQuery);

        if (currentPage === 1) {
          fetchStudies(1, searchQuery, selectedPatient);
        }
        setCurrentPage(1);
        // fetchStudies(1, searchQuery, selectedPatient);
      } else {
        fetchStudies(currentPage, searchQuery, selectedPatient);
      }
    }
  }, [isAuthenticated, currentPage, searchQuery]);



  // Set loading state based on AuthContext
  // useEffect(() => {
  //   // setLoading(authContextLoading);
  // }, [authContextLoading]);

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

        // Use AuthContext to set user data instead of local state
        if (data.user) {
          setUserData(data.user);

          // Small delay to ensure state is updated before any navigation
          await new Promise(resolve => setTimeout(resolve, 100));

          // Force a refresh of authentication state to ensure consistency
          await refreshAuth();
        }

        setLoginForm({ email: '', password: '' });
        console.log('Admin login successful, user data set in AuthContext');
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
      // Use AuthContext logout which handles everything
      await authLogout();
      setStudies({});
    } catch (error) {
      console.error('Logout error:', error);
      // Fallback: clear local state
      setStudies({});
    }
  };

  const fetchStudies = async (page = currentPage, searchQuery = searchQuery, patientFilter = selectedPatient) => {
    try {

      setLoading(true);
      setError(null);

      const token = localStorage.getItem('admin-auth-token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      // Build query parameters for server-side pagination and search
      const params = new URLSearchParams({
        page: page.toString(),
        limit: studiesPerPage.toString(),
        search: searchQuery || '',
        patient: patientFilter || ''
      });


      const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/admin/studies?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch studies');
      }

      const data = await response.json();
      console.log('✅ Database studies loaded:', data.message);

      setStudies(data.studies || {});

      // Update pagination state from server response
      if (data.pagination) {
        setCurrentPage(data.pagination.currentPage);
        setPaginationInfo(data.pagination);
      }

    } catch (err) {
      console.error('❌ fetchStudies error:', err);
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

  // Server-side pagination - studies are already filtered and paginated
  const displayStudies = studies;

  // Get pagination info from server response
  const totalStudies = paginationInfo.totalStudies || 0;
  const totalPages = paginationInfo.totalPages || 0;
  const startIndex = ((paginationInfo.currentPage || 1) - 1) * studiesPerPage;
  const endIndex = Math.min(startIndex + studiesPerPage, totalStudies);

  // Debounce search input - update searchQuery after user stops typing
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      setSearchQuery(searchInput);
    }, 500); // 500ms delay

    return () => clearTimeout(debounceTimer);
  }, [searchInput]);

  // Reset to first page when search query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedPatient]);

  const header = (
    <>
      <div className="header">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              <Image src={`${router.basePath}/images/ihc-white.png`} alt="Logo" width={200} height={80} />
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
        <div className="flex gap-4 items-center">
          <Link href="/admin/upload" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium">
            📁 Upload DICOM Files
          </Link>
          <Link href="/admin/upload-history" className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium">
            📋 Upload History
          </Link>

          {/* Search Input */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search by Patient Name, URN, Episode, or Study..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-80 px-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {searchLoading && (
              <div className="absolute right-8 top-1/2 transform -translate-y-1/2 text-blue-500">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
              </div>
            )}
            {searchInput && !searchLoading && (
              <button
                onClick={() => {
                  setSearchInput('');
                  setSearchQuery('');
                }}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            )}
          </div>
        </div>

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
    </>
  );

  if (!isAuthenticated && !authContextLoading) {
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
        {header}

        {loading ? (
          <Layout>
            <div className="min-h-screen bg-gray-50">
              <div className="max-w-7xl">
                {/* Loading indicator */}
                <div className="text-center mb-8">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                  <h2 className="text-xl font-semibold text-gray-900 mb-2">Loading DICOM Studies</h2>
                  <p className="text-gray-600">Please wait while we fetch your studies...</p>
                </div>

                {/* Loading skeleton cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="bg-white rounded-lg shadow-md overflow-hidden animate-pulse">
                      {/* Skeleton thumbnail */}
                      <div className="h-32 bg-gray-200"></div>

                      {/* Skeleton content */}
                      <div className="p-6">
                        <div className="space-y-3">
                          <div className="h-5 bg-gray-200 rounded w-3/4"></div>
                          <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                          <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                          <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                          <div className="h-3 bg-gray-200 rounded w-1/3"></div>
                          <div className="h-3 bg-gray-200 rounded w-2/5"></div>
                        </div>
                        <div className="mt-4 h-8 bg-gray-200 rounded"></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Layout>
        ) : ''}
        {/* Search Results Summary */}
        {(searchQuery || selectedPatient) && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-800">
                  {searchQuery && (
                    <span>Search results for "<strong>{searchQuery}</strong>"</span>
                  )}
                  {searchQuery && selectedPatient && <span> • </span>}
                  {selectedPatient && (
                    <span>Filtered by Patient: <strong>{selectedPatient}</strong></span>
                  )}
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  Found {totalStudies} studies
                  {totalStudies > studiesPerPage && (
                    <span> • Page {currentPage} of {totalPages}</span>
                  )}
                </p>
              </div>
              <button
                onClick={() => {
                  setSearchInput('');
                  setSearchQuery('');
                  setSelectedPatient(null);
                  setCurrentPage(1);
                }}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                Clear Filters
              </button>
            </div>
          </div>
        )}

        {/* Pagination Controls - Top */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mb-6 p-4 bg-gray-50 border border-gray-200 rounded-md">
            <div className="text-sm text-gray-600">
              Showing {startIndex + 1}-{Math.min(endIndex, totalStudies)} of {totalStudies} studies
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className={`px-3 py-1 rounded text-sm ${currentPage === 1
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
              >
                Previous
              </button>

              {/* Page Numbers */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`px-3 py-1 rounded text-sm ${currentPage === pageNum
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                  >
                    {pageNum}
                  </button>
                );
              })}

              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className={`px-3 py-1 rounded text-sm ${currentPage === totalPages
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {Object.keys(studies).length === 0 ? (
          <div className="no-studies">
            <h2>No DICOM studies found</h2>
            <p>
              {searchQuery || selectedPatient
                ? 'Try adjusting your search criteria'
                : 'Upload DICOM files to get started.'}
            </p>
            {!searchQuery && !selectedPatient && (
              <Link href="/upload" className="upload-link">
                📁 Upload Files
              </Link>
            )}
          </div>
        ) : (
          <div className="studies-grid">
            {Object.entries(studies).map(([studyId, study]) => (
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
                      📊 DICOM | {study.uploadedPatientId} - {study.uploadedPatientName}
                    </div>
                  )}
                </div>
                <div className="study-info">
                  <h3>{study.patientName || 'Unknown Patient'}</h3>
                  <div className="study-details">
                    <p><strong>Patient ID:</strong> {study.patientID || 'N/A'}</p>
                    {(() => {
                      // Extract episode ID from folder name or firstFile path
                      const firstFile = study.firstFile || '';
                      const folderName = firstFile.includes('/') ? firstFile.split('/')[0] : '';
                      const episodeId = folderName.includes('_') ? folderName.split('_').slice(1).join('_') : null;
                      return episodeId ? (
                        <p><strong>Episode ID:</strong> {episodeId}</p>
                      ) : null;
                    })()}
                    <p><strong>Study Date:</strong> {study.studyDate || 'N/A'}</p>
                    <p><strong>Modality:</strong> {study.modality || 'N/A'}</p>
                    <p><strong>Description:</strong> {study.studyDescription || 'N/A'}</p>
                    <p><strong>Files:</strong> {study.totalFiles || 0}</p>
                    <p><strong>Series:</strong> {study.totalSeries || 0}</p>
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

        {/* Pagination Controls - Bottom */}
        {totalPages > 1 && Object.keys(studies).length > 0 && (
          <div className="flex items-center justify-center mt-8 p-4 bg-gray-50 border border-gray-200 rounded-md">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className={`px-4 py-2 rounded text-sm font-medium ${currentPage === 1
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
              >
                ← Previous
              </button>

              <span className="px-4 py-2 text-sm text-gray-600">
                Page {currentPage} of {totalPages}
              </span>

              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className={`px-4 py-2 rounded text-sm font-medium ${currentPage === totalPages
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
