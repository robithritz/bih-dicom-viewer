import { requireAuth } from '../../../lib/auth-middleware';
import prisma from '../../../lib/prisma';
import crypto from 'crypto';

function addDuration(base, duration) {
  const d = new Date(base);
  if (duration === '1w' || duration === '1week') {
    d.setDate(d.getDate() + 7);
  } else if (duration === '1m' || duration === '1month') {
    d.setMonth(d.getMonth() + 1);
  } else {
    d.setDate(d.getDate() + 7); // default 1 week
  }
  return d;
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { studyInstanceUID, duration } = req.body || {};
    if (!studyInstanceUID) {
      return res.status(400).json({ error: 'studyInstanceUID is required' });
    }

    // Lookup study
    const study = await prisma.dicomStudy.findUnique({ where: { studyInstanceUID } });
    if (!study) {
      return res.status(404).json({ error: 'Study not found' });
    }

    // Validate ownership: patient can only share their own study
    const multiUrn = req.patient?.multiUrn || [];
    const canAccess = study.uploadedPatientId === req.patient.urn || multiUrn.includes(study.uploadedPatientId);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Generate or update public token and expiry
    const token = crypto.randomBytes(16).toString('hex');
    const now = new Date();
    const expiresAt = addDuration(now, duration);

    const updated = await prisma.dicomStudy.update({
      where: { id: study.id },
      data: {
        isPublic: true,
        publicToken: token,
        publicExpiresAt: expiresAt,
      }
    });

    const base = process.env.NEXT_PUBLIC_APP_URL || '';
    const shareUrl = `${base}/public/viewer/${encodeURIComponent(token)}`;

    return res.status(200).json({
      ok: true,
      shareUrl,
      token,
      expiresAt: updated.publicExpiresAt,
    });
  } catch (err) {
    console.error('Error creating public share:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default requireAuth(handler);

