import { createOrUpdatePatient } from '../../lib/patient-service.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, patientId, name } = req.body;

    if (!email || !patientId) {
      return res.status(400).json({ error: 'Email and patientId are required' });
    }

    const patient = await createOrUpdatePatient({
      email: email.toLowerCase(),
      patientId,
      name: name || null
    });

    res.status(200).json({
      success: true,
      message: 'Patient created successfully',
      patient: {
        email: patient.email,
        patientId: patient.patientId,
        name: patient.name
      }
    });
  } catch (error) {
    console.error('Create patient error:', error);
    res.status(500).json({ 
      error: 'Failed to create patient',
      details: error.message 
    });
  }
}
