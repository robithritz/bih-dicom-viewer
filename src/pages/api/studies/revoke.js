import { requireAuth } from '../../../lib/auth-middleware';
import prisma from '../../../lib/prisma';

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { studyInstanceUID } = req.body || {};
    if (!studyInstanceUID) {
      return res.status(400).json({ error: 'studyInstanceUID is required' });
    }

    // Lookup study by UID
    const study = await prisma.dicomStudy.findUnique({ where: { studyInstanceUID } });
    if (!study) {
      return res.status(404).json({ error: 'Study not found' });
    }

    // Validate ownership: patient can only revoke their own study's share
    const multiUrn = req.patient?.multiUrn || [];
    const canAccess = study.uploadedPatientId === req.patient.urn || multiUrn.includes(study.uploadedPatientId);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Revoke: clear public flags
    await prisma.dicomStudy.update({
      where: { id: study.id },
      data: {
        isPublic: false,
        publicToken: null,
        publicExpiresAt: null,
      }
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Error revoking public share:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default requireAuth(handler);

