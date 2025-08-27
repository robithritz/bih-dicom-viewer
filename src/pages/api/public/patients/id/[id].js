import prisma from '../../../../../lib/prisma.js';
import { requirePublicApiKey, serializePatient } from '../../../../../lib/public-api-auth.js';

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const idParam = req.query.id;
    if (!idParam) {
      return res.status(400).json({ error: 'Missing id parameter' });
    }

    // id_patients is BigInt in schema
    let idBigInt;
    try {
      idBigInt = BigInt(idParam);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid id format' });
    }

    const patient = await prisma.patient.findUnique({
      where: { idPatients: idBigInt },
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
    patient.isCompleteData = patient.dob && patient.email;

    res.status(200).json({ success: true, data: serializePatient(patient) });
  } catch (error) {
    console.error('Error getting patient by id:', error);
    res.status(500).json({ error: 'Failed to get patient' });
  }
}

export default requirePublicApiKey(handler);

