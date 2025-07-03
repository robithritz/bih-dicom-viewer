import { registerPatient } from '../../../lib/patients';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, password, patientId } = req.body;

    // Validate input
    if (!email || !password || !patientId) {
      return res.status(400).json({ error: 'Email, password, and patient ID are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Validate password strength
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    // Validate patient ID format
    if (!/^[a-zA-Z0-9_-]+$/.test(patientId)) {
      return res.status(400).json({ error: 'Patient ID can only contain letters, numbers, hyphens, and underscores' });
    }

    // Register patient
    const patient = await registerPatient(email.toLowerCase(), password, patientId);

    res.status(201).json({
      success: true,
      message: 'Patient registered successfully',
      patient: {
        email: patient.email,
        patientId: patient.patientId
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    
    if (error.message === 'Email already registered' || error.message === 'Patient ID already registered') {
      return res.status(409).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Registration failed' });
  }
}
