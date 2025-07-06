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
  const router = useRouter();

  // Check authentication status on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      // Check which type of auth token is present in localStorage
      const adminToken = localStorage.getItem('admin-auth-token');
      const patientToken = localStorage.getItem('auth-token');

      console.log("masuk checkauth ", { adminToken: !!adminToken, patientToken: !!patientToken });
      console.log("PATHNAME", router.pathname);
      const pathname = router.pathname;
      if (adminToken && (pathname.includes('/portal') || pathname.includes('/admin/viewer'))) {
        // Check admin authentication
        const response = await fetch('/api/admin/auth/me', {
          headers: {
            'Authorization': `Bearer ${adminToken}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          setUser(data.user);
        } else {
          // Invalid token, remove it
          localStorage.removeItem('admin-auth-token');
          setUser(null);
        }
      } else if (patientToken) {
        // Check patient authentication
        const response = await fetch('/api/auth/me', {
          headers: {
            'Authorization': `Bearer ${patientToken}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          setUser(data.patient);
        } else {
          // Invalid token, remove it
          localStorage.removeItem('auth-token');
          setUser(null);
        }
      } else {
        // No auth tokens present
        setUser(null);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setUser(null);
    } finally {
      setLoading(false);
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
