import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

// Helper function to recursively delete directory
const deleteDirectory = (dirPath) => {
    if (fs.existsSync(dirPath)) {
        fs.readdirSync(dirPath).forEach((file) => {
            const curPath = path.join(dirPath, file);
            if (fs.lstatSync(curPath).isDirectory()) {
                deleteDirectory(curPath);
            } else {
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(dirPath);
    }
};

export default async function handler(req, res) {
    if (req.method !== 'DELETE') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Verify admin authentication
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.substring(7);
        let decoded;

        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (jwtError) {
            console.error('JWT verification failed:', jwtError);
            return res.status(401).json({ error: 'Invalid token' });
        }

        // Verify user exists and has admin role
        const user = await prisma.user.findUnique({
            where: { id: decoded.id }
        });

        if (!user || user.role !== 'superadmin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { folderName } = req.body;

        if (!folderName) {
            return res.status(400).json({ error: 'Folder name is required' });
        }

        // First, get all studies with this folder name to know which patient directory to delete
        const studies = await prisma.dicomStudy.findMany({
            where: {
                uploadedFolderName: folderName
            },
            select: {
                uploadedPatientId: true,
                uploadedFolderName: true
            }
        });

        if (studies.length === 0) {
            return res.status(404).json({ error: 'No studies found with this folder name' });
        }

        const dicomBasePath = path.join(process.cwd(), 'DICOM');
        const patientDirPath = path.join(dicomBasePath, folderName);

        console.log(`Attempting to delete directory: ${patientDirPath}`);

        // Check if the directory exists
        if (!fs.existsSync(patientDirPath)) {
            console.log(`Directory does not exist: ${patientDirPath}`);
        } else {
            // Delete the physical directory and all its contents
            try {
                deleteDirectory(patientDirPath);
                console.log(`Successfully deleted directory: ${patientDirPath}`);
            } catch (deleteError) {
                console.error(`Error deleting directory ${patientDirPath}:`, deleteError);
                return res.status(500).json({
                    error: 'Failed to delete physical directory',
                    details: deleteError.message
                });
            }
        }

        // Update all studies with this uploadedFolderName to set active=false
        const updateResult = await prisma.dicomStudy.updateMany({
            where: {
                uploadedFolderName: folderName
            },
            data: {
                active: false
            }
        });

        console.log(`Updated ${updateResult.count} studies to inactive for folder: ${folderName}`);

        res.status(200).json({
            success: true,
            message: `Successfully deleted folder "${folderName}" and marked ${updateResult.count} studies as inactive`,
            deletedDirectory: patientDirPath,
            updatedStudies: updateResult.count
        });

    } catch (error) {
        console.error('Delete folder error:', error);
        res.status(500).json({
            error: 'Failed to delete folder',
            details: error.message
        });
    } finally {
        await prisma.$disconnect();
    }
}
