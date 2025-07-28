import fs from 'fs';
import path from 'path';
import { requireAdminAuth } from '../../../lib/auth-middleware';

const DICOM_DIR = path.join(process.cwd(), 'DICOM');

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!fs.existsSync(DICOM_DIR)) {
      return res.status(200).json({
        folders: [],
        message: 'DICOM directory does not exist'
      });
    }

    const items = fs.readdirSync(DICOM_DIR);
    const folders = [];

    for (const item of items) {
      const itemPath = path.join(DICOM_DIR, item);
      const stat = fs.statSync(itemPath);
      
      if (stat.isDirectory()) {
        // Count DICOM files in folder
        const files = fs.readdirSync(itemPath);
        const dicomFiles = files.filter(file => 
          file.toLowerCase().endsWith('.dcm') || 
          file.toLowerCase().endsWith('.dicom')
        );

        folders.push({
          name: item,
          path: itemPath,
          fileCount: dicomFiles.length,
          totalFiles: files.length,
          created: stat.birthtime,
          modified: stat.mtime
        });
      }
    }

    // Sort by creation time (newest first)
    folders.sort((a, b) => new Date(b.created) - new Date(a.created));

    res.status(200).json({
      folders,
      totalFolders: folders.length,
      dicomDir: DICOM_DIR
    });

  } catch (error) {
    console.error('Error listing DICOM folders:', error);
    res.status(500).json({ 
      error: 'Failed to list DICOM folders',
      message: error.message 
    });
  }
}

export default requireAdminAuth(handler);
