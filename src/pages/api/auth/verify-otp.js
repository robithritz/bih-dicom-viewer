import jwt from 'jsonwebtoken';
import { getPatientByEmail, createOrUpdatePatient } from '../../../lib/patient-service.js';
import { verifyOTP } from '../../../lib/otp-prisma.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, otp, sessionId } = req.body;

    console.log('OTP verification request:', { email, otp: otp ? '***' : undefined, sessionId });

    // Validate input
    if (!email || !otp || !sessionId) {
      console.log('Missing required fields:', { email: !!email, otp: !!otp, sessionId: !!sessionId });
      return res.status(400).json({ error: 'Email, OTP, and session ID are required' });
    }

    const normalizedEmail = email.toLowerCase();

    // Verify OTP
    const verification = await verifyOTP(normalizedEmail, otp, sessionId);

    if (!verification.success) {
      return res.status(401).json({
        error: verification.error || 'OTP verification failed',
        attemptsLeft: verification.attemptsLeft
      });
    }

    // Get or create patient
    let patient = await getPatientByEmail(normalizedEmail);
    if (!patient) {
      // Create new patient with email as patient ID fallback
      const patientId = normalizedEmail.split('@')[0];
      patient = await createOrUpdatePatient({
        email: normalizedEmail,
        patientId: patientId,
        name: null
      });
    } else {
      // Update last login
      await createOrUpdatePatient({
        email: normalizedEmail,
        patientId: patient.patientId,
        name: patient.name
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        email: patient.email,
        patientId: patient.patientId
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Set HTTP-only cookie
    res.setHeader('Set-Cookie', `auth-token=${token}; HttpOnly; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Strict`);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      patient: {
        email: patient.email,
        patientId: patient.patientId
      }
    });

  } catch (error) {
    console.error('OTP verification error:', error);

    // Handle specific OTP verification errors
    if (error.message === 'No OTP session found for this email') {
      return res.status(401).json({ error: 'No verification session found. Please request a new code.' });
    }

    if (error.message === 'Invalid session') {
      return res.status(401).json({ error: 'Invalid session. Please request a new code.' });
    }

    if (error.message === 'OTP already used') {
      return res.status(401).json({ error: 'Verification code already used. Please request a new code.' });
    }

    if (error.message === 'OTP has expired') {
      return res.status(401).json({ error: 'Verification code has expired. Please request a new code.' });
    }

    if (error.message === 'Invalid OTP') {
      return res.status(401).json({ error: 'Invalid verification code. Please try again.' });
    }

    if (error.message.includes('Too many verification attempts')) {
      return res.status(429).json({ error: error.message });
    }

    res.status(500).json({ error: 'Verification failed' });
  }
}
