import fs from 'fs';
import path from 'path';
import prisma from '../../../../../lib/prisma';
import { DICOM_DIR } from '../../../../../lib/dicom';

export default async function handler(req, res) {
  const { token, filename } = req.query;

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const study = await prisma.dicomStudy.findFirst({
      where: {
        publicToken: token,
        isPublic: true,
        publicExpiresAt: { gt: new Date() },
      }
    });

    if (!study) return res.status(404).json({ error: 'Not found or expired' });

    // Ensure the requested file is inside the shared study folder
    const sharedFolder = (study.firstFile || '').split('/')[0];
    const reqFolder = (filename || '').split('/')[0];
    if (!sharedFolder || sharedFolder !== reqFolder) {
      return res.status(403).json({ error: 'File not part of shared study' });
    }

    const filePath = path.join(DICOM_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.setHeader('Content-Type', 'application/dicom');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

    const fileBuffer = fs.readFileSync(filePath);
    res.send(fileBuffer);
  } catch (err) {
    console.error('Public dicom-file error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

