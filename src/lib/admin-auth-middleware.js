import jwt from 'jsonwebtoken';
import { getUserByEmail } from './user-service.js';
import { isTokenValidAndTouch } from './token-store.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

/**
 * Verify JWT token and extract admin user information from session
 * @param {Object} req - Next.js request object
 * @returns {Object} - User information or null if not authenticated
 */
export const verifyAdminSession = async (req) => {
  try {
    // Get token from cookie
    const token = req.headers['authorization']?.split(' ')?.[1];

    console.log("ada token nya" + token);
    if (!token) {
      return null;
    }

    // Verify token signature
    const decoded = jwt.verify(token, JWT_SECRET);

    // Inactivity enforcement
    const active = await isTokenValidAndTouch(token);
    if (!active) {
      return null;
    }

    // Get user data from database
    const user = await getUserByEmail(decoded.email);

    if (!user) {
      return null;
    }

    return {
      id: user.id.toString(),
      email: user.email,
      name: user.name,
      role: user.role
    };

  } catch (error) {
    console.error('Admin session verification error:', error);
    return null;
  }
};

/**
 * Middleware to require admin authentication for API endpoints
 * @param {Function} handler - The API handler function
 * @returns {Function} - Wrapped handler with admin authentication
 */
export const requireAdminAuth = (handler) => {
  return async (req, res) => {
    const user = await verifyAdminSession(req);

    if (!user) {
      return res.status(401).json({
        error: 'Admin authentication required. Please log in to access this resource.'
      });
    }

    // Add user info to request object
    req.user = user;
    req.admin = user;

    return handler(req, res);
  };
};

/**
 * Middleware to require specific admin roles
 * @param {Array|string} allowedRoles - Roles that can access the endpoint
 * @returns {Function} - Middleware function
 */
export const requireAdminRole = (allowedRoles) => {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (handler) => {
    return async (req, res) => {
      const user = await verifyAdminSession(req);

      if (!user) {
        return res.status(401).json({
          error: 'Admin authentication required. Please log in to access this resource.'
        });
      }

      if (!roles.includes(user.role)) {
        return res.status(403).json({
          error: `Access denied. Required role: ${roles.join(' or ')}`
        });
      }

      // Add user info to request object
      req.user = user;

      return handler(req, res);
    };
  };
};

/**
 * Generate JWT token for admin user
 * @param {Object} user - User object
 * @returns {string} - JWT token
 */
export const generateAdminToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: '7d' } // 7 days
  );
};
