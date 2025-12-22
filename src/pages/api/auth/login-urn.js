import jwt from 'jsonwebtoken';
import prisma from '../../../lib/prisma.js';
import { saveToken } from '../../../lib/token-store.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let { urn, last4Id, combined } = req.body || {};

    // Support combined input: <URN><last4digits>
    if (combined && (!urn || !last4Id)) {
      const s = (combined || '').toString().trim();
      if (s.length < 5) {
        return res.status(400).json({ error: 'Invalid input format' });
      }
      const tail = s.slice(-4);
      if (!/^[A-Za-z0-9]{4}$/.test(tail)) {
        return res.status(400).json({ error: 'Invalid input format' });
      }
      urn = s.slice(0, -4).trim();
      last4Id = tail;
    }
    console.log('Login request for:', urn, 'with last 4 digits:', last4Id);

    if (!urn || !last4Id) {
      return res.status(400).json({ error: 'URN and last 4 digits of ID are required' });
    }

    // Find patient by URN
    const patient = await prisma.patient.findUnique({ where: { urn } });

    // Do not reveal which part is incorrect for security
    if (!patient) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    console.log('Found patient:', patient);

    // Verify last 4 digits of ID using priority: nik -> passport_num -> kitas_num
    const firstId = [patient.nik, patient.passport_num, patient.kitas_num].find((v) => (v || '').toString().trim().length > 0);

    console.log('First ID:', firstId);
    if (!firstId) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const fourLastChars = (s) => (s || '').toString().trim().slice(-4);
    const expectedLast4 = fourLastChars(firstId);
    const providedLast4 = fourLastChars(last4Id);

    if (!expectedLast4 || expectedLast4 !== providedLast4) {
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
    console.error('URN+ID login error:', error);
    return res.status(500).json({ error: 'Login failed' });
  }
}

