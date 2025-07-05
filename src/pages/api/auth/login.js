import { createOTPSession } from '../../../lib/otp-prisma.js';
import { sendOTPEmail } from '../../../lib/email.js';
import { getPatientByEmail } from '../../../lib/patient-service.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email } = req.body;

    // Validate input
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const normalizedEmail = email.toLowerCase();

    console.log('Login request for:', normalizedEmail);

    // Check if patient exists in database
    const patient = await getPatientByEmail(normalizedEmail);
    if (!patient) {
      return res.status(401).json({ error: 'Patient not found. Please contact administrator to register your account.' });
    }

    console.log('Patient found:', { email: patient.email, patientId: patient.patientId });

    // Create OTP session for existing patient
    const otpSession = await createOTPSession(normalizedEmail);

    console.log('OTP session created:', { success: !!otpSession.sessionId, sessionId: otpSession.sessionId });

    // Send OTP email
    await sendOTPEmail(normalizedEmail, otpSession.otp, patient.patientId);

    res.status(200).json({
      success: true,
      message: 'Verification code sent to your email',
      sessionId: otpSession.sessionId,
      expiresAt: Date.now() + (parseInt(process.env.OTP_EXPIRED_TIME_IN_SECOND) || 300) * 1000,
      retryCount: 1,
      maxRetries: parseInt(process.env.OTP_MAX_RETRY) || 5
    });

  } catch (error) {
    console.error('Login error:', error);

    // Handle specific OTP errors
    if (error.message.includes('Too many OTP requests')) {
      return res.status(429).json({ error: error.message });
    }

    if (error.message.includes('Failed to send verification email')) {
      return res.status(500).json({ error: 'Failed to send verification email. Please try again.' });
    }

    res.status(500).json({ error: 'Login request failed' });
  }
}
