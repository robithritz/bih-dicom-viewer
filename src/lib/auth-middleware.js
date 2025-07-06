import jwt from 'jsonwebtoken';
import { getPatientByEmail } from './patient-service.js';
import { getUserById } from './user-service.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

/**
 * Verify JWT token and extract patient information from session
 * @param {Object} req - Next.js request object
 * @returns {Object} - Patient information or null if not authenticated
 */
export const verifyPatientSession = async (req) => {
  try {
    // Get token from Authorization header or cookie (for backward compatibility)
    let token;

    // Check Authorization header first
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    if (!token) {
      return null;
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Get patient data from database
    const patient = await getPatientByEmail(decoded.email);

    if (!patient) {
      return null;
    }

    return {
      id: patient.idPatients.toString(),
      urn: patient.urn,
      email: patient.email,
      patientId: patient.psid, // Use psid as patient ID
      firstName: patient.firstName,
      lastName: patient.lastName,
      sex: patient.sex,
      age: patient.age,
      dob: patient.dob,
      updatedAt: patient.updatedAt
    };

  } catch (error) {
    console.error('Session verification error:', error);
    return null;
  }
};

/**
 * Middleware to require authentication for API endpoints
 * @param {Function} handler - The API handler function
 * @returns {Function} - Wrapped handler with authentication
 */
export const requireAuth = (handler) => {
  return async (req, res) => {
    const patient = await verifyPatientSession(req);

    if (!patient) {
      return res.status(401).json({
        error: 'Authentication required. Please log in to access your medical files.'
      });
    }

    // Add patient info to request object
    req.patient = patient;

    return handler(req, res);
  };
};

/**
 * Check if a patient has access to a specific file
 * @param {string} patientId - Patient ID from session
 * @param {string} filename - Filename being requested
 * @returns {boolean} - Whether patient has access to the file
 */
export const hasFileAccess = (patientId, filename) => {
  // If filename already includes patient folder path (e.g., "00234/file.dcm")
  if (filename.includes('/')) {
    const [filePatientId] = filename.split('/');
    return filePatientId === patientId;
  }

  // For backward compatibility, assume direct access if no folder structure
  // This should be phased out as all files should be in patient folders
  return true;
};

/**
 * Get the correct file path for a patient's DICOM file
 * @param {string} patientId - Patient ID from session
 * @param {string} filename - Filename being requested
 * @returns {string} - Correct file path with patient folder
 */
export const getPatientFilePath = (patientId, filename) => {
  // If filename already includes patient folder path, use as-is
  if (filename.includes('/')) {
    return filename;
  }

  // Otherwise, prepend patient ID folder
  return `${patientId}/${filename}`;
};

/**
 * Validate that the requested file belongs to the authenticated patient
 * @param {Object} req - Request object with patient info
 * @param {string} filename - Filename being requested
 * @returns {Object} - { isValid: boolean, patientFilePath: string, error?: string }
 */
export const validatePatientFileAccess = (req, filename) => {
  const patient = req.patient;

  if (!patient) {
    return {
      isValid: false,
      error: 'Patient session not found'
    };
  }

  // Parse the filename parameter which might be in format "patientId/filename" or just "filename"
  let patientIdFromPath, actualFilename;

  if (filename.includes('/')) {
    // Format: "patientId/filename"
    [patientIdFromPath, actualFilename] = filename.split('/');

    // Validate that the patient ID in path matches authenticated patient
    if (patientIdFromPath !== patient.urn) {
      return {
        isValid: false,
        error: 'Access denied: Patient ID mismatch'
      };
    }
  } else {
    // Format: just "filename" - use authenticated patient ID
    actualFilename = filename;
    patientIdFromPath = patient.urn;
  }

  // Get the correct file path for this patient
  const patientFilePath = getPatientFilePath(patientIdFromPath, actualFilename);

  // Check if patient has access to this file
  if (!hasFileAccess(patientIdFromPath, patientFilePath)) {
    return {
      isValid: false,
      error: 'Access denied. You can only access your own medical files.'
    };
  }

  return {
    isValid: true,
    patientFilePath,
    actualFilename,
    patientId: patientIdFromPath
  };
};

/**
 * Admin authentication middleware
 * Validates admin JWT token and ensures user has admin privileges
 */
export const requireAdminAuth = (handler) => {
  return async (req, res) => {
    try {
      // Get admin token from Authorization header or cookie (for backward compatibility)
      // let token = req.cookies['admin-auth-token'];
      let token;

      // Check Authorization header first
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }

      if (!token) {
        return res.status(401).json({ error: 'Admin authentication required' });
      }

      // Verify admin token
      const decoded = jwt.verify(token, JWT_SECRET);
      console.log("dECODE", decoded);

      // Get admin user data
      const user = await getUserById(decoded.id);

      console.log(user);

      if (!user || user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Admin privileges required' });
      }

      // Add admin user to request
      req.admin = user;

      // Call the original handler
      return handler(req, res);

    } catch (error) {
      console.error('Admin auth error:', error);

      if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Invalid or expired admin token' });
      }

      return res.status(500).json({ error: 'Admin authentication failed' });
    }
  };
};
