import { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/router';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const router = useRouter();

  // Check authentication status on mount and when router is ready
  useEffect(() => {
    // Only run checkAuth when router is ready and we haven't initialized yet
    if (router.isReady && !isInitialized) {
      checkAuth();
    }
  }, [router.isReady, isInitialized]);

  const checkAuth = async (retryCount = 0) => {
    try {
      setLoading(true);

      // Ensure we're in the browser environment
      if (typeof window === 'undefined') {
        setLoading(false);
        setIsInitialized(true);
        return;
      }

      // Check which type of auth token is present in localStorage
      const adminToken = localStorage.getItem('admin-auth-token');
      const patientToken = localStorage.getItem('auth-token');

      console.log("masuk checkauth ", {
        adminToken: !!adminToken,
        patientToken: !!patientToken,
        pathname: router.pathname,
        isReady: router.isReady,
        retryCount
      });

      const pathname = router.pathname;

      if (adminToken && (pathname.includes('/portal') || pathname.includes('/admin/') || pathname.includes('/upload'))) {
        // Check admin authentication
        try {
          const response = await fetch('/api/admin/auth/me', {
            headers: {
              'Authorization': `Bearer ${adminToken}`
            }
          });

          if (response.ok) {
            const data = await response.json();
            setUser(data.user);
            console.log("Admin auth successful:", data.user);
          } else {
            console.log("Admin auth failed, removing token");
            // Invalid token, remove it
            localStorage.removeItem('admin-auth-token');
            setUser(null);
          }
        } catch (fetchError) {
          console.error('Admin auth API call failed:', fetchError);
          // If it's a network error and we haven't retried too many times, retry
          if (retryCount < 2) {
            console.log(`Retrying admin auth check (attempt ${retryCount + 1})`);
            setTimeout(() => checkAuth(retryCount + 1), 1000);
            return;
          }
          // After max retries, assume token is invalid
          localStorage.removeItem('admin-auth-token');
          setUser(null);
        }
      } else if (patientToken) {
        // Check patient authentication
        try {
          const response = await fetch('/api/auth/me', {
            headers: {
              'Authorization': `Bearer ${patientToken}`
            }
          });

          if (response.ok) {
            const data = await response.json();
            setUser(data.patient);
            console.log("Patient auth successful:", data.patient);
          } else {
            console.log("Patient auth failed, removing token");
            // Invalid token, remove it
            localStorage.removeItem('auth-token');
            setUser(null);
          }
        } catch (fetchError) {
          console.error('Patient auth API call failed:', fetchError);
          // If it's a network error and we haven't retried too many times, retry
          if (retryCount < 2) {
            console.log(`Retrying patient auth check (attempt ${retryCount + 1})`);
            setTimeout(() => checkAuth(retryCount + 1), 1000);
            return;
          }
          // After max retries, assume token is invalid
          localStorage.removeItem('auth-token');
          setUser(null);
        }
      } else {
        // No auth tokens present
        console.log("No auth tokens found");
        setUser(null);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setUser(null);
    } finally {
      setLoading(false);
      setIsInitialized(true);
    }
  };

  const register = async (email, password, patientId) => {
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, patientId }),
      });

      const data = await response.json();

      if (response.ok) {
        return { success: true, message: 'Registration successful. Please login with your email.' };
      } else {
        return { success: false, error: data.error };
      }
    } catch (error) {
      console.error('Registration failed:', error);
      return { success: false, error: 'Registration failed' };
    }
  };

  const logout = async () => {
    try {
      // Clear tokens from localStorage
      localStorage.removeItem('admin-auth-token');
      localStorage.removeItem('auth-token');

      // Optional: Call logout API to invalidate server-side sessions
      await fetch('/api/auth/logout', {
        method: 'POST',
      });

      setUser(null);
      router.push('/');
    } catch (error) {
      console.error('Logout failed:', error);
      // Still clear user state and tokens even if API call fails
      localStorage.removeItem('admin-auth-token');
      localStorage.removeItem('auth-token');
      setUser(null);
      router.push('/');
    }
  };

  const value = {
    user,
    loading,
    isInitialized,
    register,
    logout,
    checkAuth,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
