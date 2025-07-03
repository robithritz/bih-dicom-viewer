import jwt from 'jsonwebtoken';
import { getPatientByEmail } from './patient-service.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

/**
 * Verify JWT token and extract patient information from session
 * @param {Object} req - Next.js request object
 * @returns {Object} - Patient information or null if not authenticated
 */
export const verifyPatientSession = async (req) => {
  try {
    // Get token from cookie
    const token = req.cookies['auth-token'];

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

    if (!patient.isActive) {
      return null;
    }

    return {
      email: patient.email,
      patientId: patient.patientId,
      lastLogin: patient.lastLogin
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

  // Get the correct file path for this patient
  const patientFilePath = getPatientFilePath(patient.patientId, filename);

  // Check if patient has access to this file
  if (!hasFileAccess(patient.patientId, patientFilePath)) {
    return {
      isValid: false,
      error: 'Access denied. You can only access your own medical files.'
    };
  }

  return {
    isValid: true,
    patientFilePath
  };
};
