import prisma from '../../lib/prisma.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Test database connection
    const userCount = await prisma.user.count();
    const otpCount = await prisma.otp.count();
    const patientCount = await prisma.dicomPatient.count();

    res.status(200).json({
      success: true,
      message: 'Database connection successful',
      counts: {
        users: userCount,
        otps: otpCount,
        patients: patientCount
      }
    });
  } catch (error) {
    console.error('Database test error:', error);
    res.status(500).json({ 
      error: 'Database connection failed',
      details: error.message 
    });
  }
}
