import prisma from '../../../../lib/prisma.js';
import { requirePublicApiKey, serializePatients } from '../../../../lib/public-api-auth.js';

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '25', 10), 1), 100);
    const skip = (page - 1) * limit;

    const [patients, total] = await Promise.all([
      prisma.patient.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
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
      }),
      prisma.patient.count()
    ]);

    res.status(200).json({
      success: true,
      data: serializePatients(patients),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Error listing patients:', error);
    res.status(500).json({ error: 'Failed to list patients' });
  }
}

export default requirePublicApiKey(handler);

