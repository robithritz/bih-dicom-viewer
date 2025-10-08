import jwt from 'jsonwebtoken';
import { getPatientByEmail } from '../../../lib/patient-service.js';
import { isTokenValidAndTouch } from '../../../lib/token-store.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get token from Authorization header or cookie (for backward compatibility)
    let token = req.cookies['auth-token'];

    // Check Authorization header first
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Verify token signature
    const decoded = jwt.verify(token, JWT_SECRET);

    // Inactivity enforcement: token must be present and recently used
    const active = await isTokenValidAndTouch(token);
    if (!active) {
      return res.status(401).json({ error: 'Session expired due to inactivity' });
    }

    // Get patient data
    const patient = await getPatientByEmail(decoded.email);

    if (!patient) {
      return res.status(401).json({ error: 'Patient not found' });
    }

    res.status(200).json({
      success: true,
      patient: {
        id: patient.idPatients.toString(),
        urn: patient.urn,
        isMultiPatient: patient.isMultiPatient,
        multiUrn: patient.multiUrn,
        email: patient.email,
        patientId: patient.psid,
        firstName: patient.firstName,
        lastName: patient.lastName,
        sex: patient.sex,
        age: patient.age,
        dob: patient.dob,
        updatedAt: patient.updatedAt
      }
    });

  } catch (error) {
    console.error('Auth check error:', error);

    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    res.status(500).json({ error: 'Authentication check failed' });
  }
}
