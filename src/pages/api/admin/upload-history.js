import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

export default async function handler(req, res) {
    if (req.method !== 'GET') {
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

        console.log(decoded);

        // Verify user exists and has admin role
        const user = await prisma.user.findUnique({
            where: { id: decoded.id }
        });

        if (!user || user.role !== 'dicomadmin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Fetch upload history grouped by uploadedFolderName
        // Order by created_at desc and group by uploadedFolderName
        const uploadHistory = await prisma.dicomStudy.groupBy({
            by: ['uploadedFolderName'],
            _count: {
                id: true
            },
            _sum: {
                totalFiles: true
            },
            _min: {
                createdAt: true,
                uploadedPatientId: true
            },
            orderBy: {
                _min: {
                    createdAt: 'desc'
                }
            },
            where: {
                active: true
            }
        });

        // For each folder, get the detailed studies
        const detailedHistory = await Promise.all(
            uploadHistory.map(async (folder) => {
                const studies = await prisma.dicomStudy.findMany({
                    where: {
                        uploadedFolderName: folder.uploadedFolderName
                    },
                    select: {
                        id: true,
                        studyInstanceUID: true,
                        patientName: true,
                        patientID: true,
                        studyDate: true,
                        studyDescription: true,
                        modality: true,
                        totalFiles: true,
                        totalSeries: true,
                        active: true,
                        createdAt: true
                    },
                    orderBy: {
                        createdAt: 'desc'
                    }
                });

                return {
                    folderName: folder.uploadedFolderName,
                    studyCount: folder._count.id,
                    totalFiles: folder._sum.totalFiles || 0,
                    patientId: folder._min.uploadedPatientId,
                    createdAt: folder._min.createdAt,
                    studies: studies
                };
            })
        );

        res.status(200).json({
            success: true,
            uploadHistory: detailedHistory
        });

    } catch (error) {
        console.error('Upload history fetch error:', error);
        res.status(500).json({
            error: 'Failed to fetch upload history',
            details: error.message
        });
    } finally {
        await prisma.$disconnect();
    }
}
