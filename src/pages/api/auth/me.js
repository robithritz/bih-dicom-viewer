import jwt from 'jsonwebtoken';
import { getPatientByEmail } from '../../../lib/patient-service.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get token from cookie
    const token = req.cookies['auth-token'];

    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Get patient data
    const patient = await getPatientByEmail(decoded.email);

    if (!patient) {
      return res.status(401).json({ error: 'Patient not found' });
    }

    res.status(200).json({
      success: true,
      patient: {
        email: patient.email,
        patientId: patient.patientId,
        lastLogin: patient.lastLogin
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
