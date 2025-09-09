import { requireAdminAuth } from '../../../lib/admin-auth-middleware';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      patient,
      page = 1,
      limit = 10,
      search = ''
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    // Build query conditions
    const whereConditions = {
      active: true // Only get active studies
    };

    // Filter by patient if specified
    if (patient) {
      whereConditions.uploadedPatientId = patient;
    }

    // Add search conditions
    if (search.trim()) {
      const searchQuery = search.toLowerCase().trim();
      whereConditions.OR = [
        // Search in DICOM patient name
        {
          patientName: {
            contains: searchQuery
          }
        },
        // Search in DICOM patient ID
        {
          patientID: {
            contains: searchQuery
          }
        },
        // Search in uploaded folder name (for episode ID)
        {
          uploadedFolderName: {
            contains: searchQuery
          }
        },
        // Search in uploaded patient ID
        {
          uploadedPatientId: {
            contains: searchQuery
          }
        },
        // Search in patient database records
        {
          patient: {
            OR: [
              {
                firstName: {
                  contains: searchQuery
                }
              },
              {
                lastName: {
                  contains: searchQuery
                }
              }
            ]
          }
        }
      ];
    }

    let totalStudies, dbStudies, totalPages;

    try {
      // Get total count for pagination
      totalStudies = await prisma.dicomStudy.count({
        where: whereConditions
      });

      totalPages = Math.ceil(totalStudies / limitNum);

      // Fetch paginated studies from database with patient relationship
      dbStudies = await prisma.dicomStudy.findMany({
        where: whereConditions,
        include: {
          patient: {
            select: {
              firstName: true,
              lastName: true,
              urn: true,
              email: true
            }
          }
        },
        orderBy: [
          { createdAt: 'desc' }
        ],
        skip: offset,
        take: limitNum
      });
    } catch (dbError) {
      console.error('❌ Database query error:', dbError);
      console.error('❌ Where conditions that caused error:', JSON.stringify(whereConditions, null, 2));
      throw new Error(`Database query failed: ${dbError.message}`);
    }

    // Transform database results to match the expected format
    const studies = {};

    for (const dbStudy of dbStudies) {
      // Create study object in the expected format
      const study = {
        studyInstanceUID: dbStudy.studyInstanceUID,
        patientName: dbStudy.patientName,
        patientID: dbStudy.patientID,
        patientEmail: dbStudy.patient ? dbStudy.patient.email : null,
        studyDate: dbStudy.studyDate,
        studyTime: dbStudy.studyTime,
        studyDescription: dbStudy.studyDescription,
        modality: dbStudy.modality,
        thumbnail: dbStudy.thumbnail,
        firstFile: dbStudy.firstFile,
        uploadedPatientId: dbStudy.uploadedPatientId,
        uploadedFolderName: dbStudy.uploadedFolderName,
        totalFiles: dbStudy.totalFiles || 0,
        totalSeries: dbStudy.totalSeries || 0,

        // Add patient information from database relationship
        uploadedPatientName: dbStudy.patient
          ? `${dbStudy.patient.firstName} ${dbStudy.patient.lastName}`
          : 'Unknown Patient',

        // Add metadata for compatibility
        files: [], // Will be populated when needed by individual study endpoints
        series: {} // Will be populated when needed by individual study endpoints
      };

      // Use studyInstanceUID as key (same as before)
      studies[dbStudy.studyInstanceUID] = study;
    }

    await prisma.$disconnect();

    const response = {
      studies,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalStudies,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
        limit: limitNum
      },
      patientFilter: patient || null,
      searchQuery: search || null,
      message: `Loaded ${dbStudies.length} studies from database${patient ? ` for patient ${patient}` : ' (all patients)'}${search ? ` matching "${search}"` : ''}`,
      source: 'database'
    };

    res.status(200).json(response);

  } catch (error) {
    console.error('Error fetching DICOM studies from database:', error);
    await prisma.$disconnect();
    res.status(500).json({
      error: 'Error loading DICOM studies from database',
      message: error.message
    });
  }
}

export default requireAdminAuth(handler);
