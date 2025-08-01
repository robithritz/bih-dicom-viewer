import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Get DICOM studies from database for patient authentication
 * This function replaces getDicomFilesByPatientId for database-driven approach
 * @param {string|string[]} patientId - Patient URN or array of URNs for multi-patient
 * @param {Object} options - Additional options for filtering and pagination
 * @returns {Object} - Studies object in the same format as organizeDicomStudies
 */
export async function getDicomStudiesForPatient(patientId, options = {}) {
  try {
    // Handle both single patient and multi-patient scenarios
    const patientIds = Array.isArray(patientId) ? patientId : [patientId];

    // Build query conditions
    const whereConditions = {
      uploadedPatientId: {
        in: patientIds
      },
      active: true // Only get active studies
    };

    // Add search conditions if provided
    if (options.search && options.search.trim()) {
      const searchQuery = options.search.toLowerCase().trim();
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
        // Search in study description
        {
          studyDescription: {
            contains: searchQuery
          }
        },
        // Search in uploaded folder name (for episode ID)
        {
          uploadedFolderName: {
            contains: searchQuery
          }
        }
      ];
    }

    // Add date range filtering if provided
    if (options.dateFrom || options.dateTo) {
      whereConditions.studyDate = {};
      if (options.dateFrom) {
        whereConditions.studyDate.gte = options.dateFrom;
      }
      if (options.dateTo) {
        whereConditions.studyDate.lte = options.dateTo;
      }
    }

    // Add modality filtering if provided
    if (options.modality) {
      whereConditions.modality = options.modality;
    }

    // Query DicomStudy model for active studies belonging to the patient(s)
    const dbStudies = await prisma.dicomStudy.findMany({
      where: whereConditions,
      include: {
        patient: {
          select: {
            firstName: true,
            lastName: true,
            urn: true
          }
        }
      },
      orderBy: [
        { createdAt: 'desc' }
      ],
      // Add pagination if provided
      ...(options.limit && { take: options.limit }),
      ...(options.offset && { skip: options.offset })
    });


    // Transform database results to match the expected format (same as organizeDicomStudies)
    const studies = {};

    for (const dbStudy of dbStudies) {
      // Create study object in the expected format
      const study = {
        studyInstanceUID: dbStudy.studyInstanceUID,
        patientName: dbStudy.patientName,
        patientID: dbStudy.patientID,
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

        // Add metadata for compatibility with existing code
        files: [], // Will be populated when needed by individual study endpoints
        series: {}, // Will be populated when needed by individual study endpoints

        // Add database-specific metadata
        id: dbStudy.id,
        active: dbStudy.active,
        createdAt: dbStudy.createdAt,
        updatedAt: dbStudy.updatedAt
      };

      // Use studyInstanceUID as key (same as organizeDicomStudies)
      studies[dbStudy.studyInstanceUID] = study;
    }

    return studies;

  } catch (error) {
    console.error('❌ Error fetching studies from database:', error);
    throw error;
  }
}

/**
 * Get study count for a patient
 * @param {string|string[]} patientId - Patient URN or array of URNs
 * @param {Object} options - Additional options for filtering
 * @returns {number} - Total number of studies
 */
export async function getStudyCountForPatient(patientId, options = {}) {
  try {
    const patientIds = Array.isArray(patientId) ? patientId : [patientId];

    const whereConditions = {
      uploadedPatientId: {
        in: patientIds
      },
      active: true
    };

    // Add search conditions if provided
    if (options.search && options.search.trim()) {
      const searchQuery = options.search.toLowerCase().trim();
      whereConditions.OR = [
        { patientName: { contains: searchQuery } },
        { patientID: { contains: searchQuery } },
        { studyDescription: { contains: searchQuery } },
        { uploadedFolderName: { contains: searchQuery } }
      ];
    }

    const count = await prisma.dicomStudy.count({
      where: whereConditions
    });

    return count;

  } catch (error) {
    console.error('❌ Error counting studies for patient:', error);
    throw error;
  }
}

/**
 * Get a specific study by studyInstanceUID for a patient
 * @param {string} studyInstanceUID - Study Instance UID
 * @param {string|string[]} patientId - Patient URN or array of URNs
 * @returns {Object|null} - Study object or null if not found
 */
export async function getStudyForPatient(studyInstanceUID, patientId) {
  try {
    const patientIds = Array.isArray(patientId) ? patientId : [patientId];

    const dbStudy = await prisma.dicomStudy.findFirst({
      where: {
        studyInstanceUID,
        uploadedPatientId: {
          in: patientIds
        },
        active: true
      },
      include: {
        patient: {
          select: {
            firstName: true,
            lastName: true,
            urn: true
          }
        }
      }
    });

    if (!dbStudy) {
      return null;
    }

    // Transform to expected format
    const study = {
      studyInstanceUID: dbStudy.studyInstanceUID,
      patientName: dbStudy.patientName,
      patientID: dbStudy.patientID,
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
      uploadedPatientName: dbStudy.patient
        ? `${dbStudy.patient.firstName} ${dbStudy.patient.lastName}`
        : 'Unknown Patient',
      files: [],
      series: {},
      id: dbStudy.id,
      active: dbStudy.active,
      createdAt: dbStudy.createdAt,
      updatedAt: dbStudy.updatedAt
    };

    return study;

  } catch (error) {
    console.error('❌ Error fetching study for patient:', error);
    throw error;
  }
}

/**
 * Get available modalities for a patient
 * @param {string|string[]} patientId - Patient URN or array of URNs
 * @returns {string[]} - Array of unique modalities
 */
export async function getModalitiesForPatient(patientId) {
  try {
    const patientIds = Array.isArray(patientId) ? patientId : [patientId];

    const modalities = await prisma.dicomStudy.findMany({
      where: {
        uploadedPatientId: {
          in: patientIds
        },
        active: true,
        modality: {
          not: null
        }
      },
      select: {
        modality: true
      },
      distinct: ['modality']
    });

    return modalities.map(m => m.modality).filter(Boolean).sort();

  } catch (error) {
    console.error('❌ Error fetching modalities for patient:', error);
    throw error;
  }
}

export default {
  getDicomStudiesForPatient,
  getStudyCountForPatient,
  getStudyForPatient,
  getModalitiesForPatient
};
