import prisma from '../../../../lib/prisma';

export default async function handler(req, res) {
  const { token } = req.query;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const study = await prisma.dicomStudy.findFirst({
      where: {
        publicToken: token,
        isPublic: true,
        publicExpiresAt: { gt: new Date() },
      }
    });

    if (!study) return res.status(404).json({ error: 'Not found or expired' });

    return res.status(200).json({
      ok: true,
      studyInstanceUID: study.studyInstanceUID,
      uploadedPatientId: study.uploadedPatientId,
      uploadedFolderName: study.uploadedFolderName,
      firstFile: study.firstFile,
      expiresAt: study.publicExpiresAt,
    });
  } catch (err) {
    console.error('Public study resolve error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

