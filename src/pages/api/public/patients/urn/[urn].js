import prisma from '../../../../../lib/prisma.js';
import { requirePublicApiKey, serializePatient } from '../../../../../lib/public-api-auth.js';

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { urn } = req.query;
    if (!urn) {
      return res.status(400).json({ error: 'Missing urn parameter' });
    }

    const patient = await prisma.patient.findUnique({
      where: { urn: urn.toString() },
      select: {
        idPatients: true,
        urn: true,
        psid: true,
        lastName: true,
        firstName: true,
        email: true,
        sex: true,
        age: true,
        dob: true,
        createdAt: true,
        updatedAt: true,
      }
    });

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    res.status(200).json({ success: true, data: serializePatient(patient) });
  } catch (error) {
    console.error('Error getting patient by urn:', error);
    res.status(500).json({ error: 'Failed to get patient' });
  }
}

export default requirePublicApiKey(handler);

