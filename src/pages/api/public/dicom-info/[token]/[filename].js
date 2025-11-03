import prisma from '../../../../../lib/prisma';
import { parseDicomFile, extractDicomMetadata } from '../../../../../lib/dicom';

export default async function handler(req, res) {
  const { token, filename } = req.query;
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

    const sharedFolder = (study.firstFile || '').split('/')[0];
    const reqFolder = (filename || '').split('/')[0];
    if (!sharedFolder || sharedFolder !== reqFolder) {
      return res.status(403).json({ error: 'File not part of shared study' });
    }

    const dataSet = parseDicomFile(filename);
    const metadata = extractDicomMetadata(dataSet);

    res.status(200).json(metadata);
  } catch (err) {
    console.error('Public dicom-info error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

