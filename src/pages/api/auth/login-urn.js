import jwt from 'jsonwebtoken';
import prisma from '../../../lib/prisma.js';
import { saveToken } from '../../../lib/token-store.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { urn, dob } = req.body || {};

    if (!urn || !dob) {
      return res.status(400).json({ error: 'URN and DOB are required' });
    }

    // Find patient by URN
    const patient = await prisma.patient.findUnique({ where: { urn } });

    // Do not reveal which part is incorrect for security
    if (!patient) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Normalize and compare DOB as string (stored as string in DB)
    const normalize = (s) => (s || '').toString().trim().toLowerCase();
    const dobInDMY = normalize(patient.dob).split('-').reverse().join('');

    if (normalize(dob) !== dobInDMY) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Compute multi-patient context if email exists
    let isMultiPatient = false;
    let multiUrn = [];
    if (patient.email) {
      const emailNorm = patient.email.toLowerCase();
      const siblings = await prisma.patient.findMany({ where: { email: emailNorm } });
      isMultiPatient = siblings.length > 1;
      multiUrn = siblings.map((p) => p.urn);
    }

    // Sign JWT similar to OTP flow
    const token = jwt.sign(
      {
        id: patient.idPatients.toString(),
        urn: patient.urn,
        isMultiPatient,
        multiUrn,
        psid: patient.psid,
        email: patient.email,
        firstName: patient.firstName,
        lastName: patient.lastName,
        sex: patient.sex,
        age: patient.age,
        dob: patient.dob,
        loginBy: 'urn'
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Persist token for inactivity tracking
    await saveToken({ token, userType: 'patient', patientEmail: patient.email || null });

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      patient: {
        id: patient.idPatients.toString(),
        urn: patient.urn,
        isMultiPatient,
        multiUrn,
        email: patient.email,
        patientId: patient.psid,
        firstName: patient.firstName,
        lastName: patient.lastName,
        sex: patient.sex,
        age: patient.age,
        dob: patient.dob,
        updatedAt: patient.updatedAt,
        loginBy: 'urn'
      },
    });
  } catch (error) {
    console.error('URN+DOB login error:', error);
    return res.status(500).json({ error: 'Login failed' });
  }
}

