import { getDicomFiles, getDicomFilesByPatientId, organizeDicomStudies } from '../../../lib/dicom';
import { requireAdminAuth } from '../../../lib/admin-auth-middleware';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      patient = ''
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    console.log(`📊 Admin fetching DICOM studies - Page ${pageNum}, Limit ${limitNum}, Search: "${search}", Patient: "${patient}"`);

    // Get all DICOM files organized by studies (this is still needed for organization)
    let files;
    if (patient) {
      // Try exact folder match first, then patient ID search
      files = getDicomFiles(patient);
      if (files.length === 0) {
        // If no exact folder match, try searching by patient ID across all folders
        files = getDicomFilesByPatientId(patient);
      }
    } else {
      // Get all files from all folders
      files = getDicomFiles(null);
    }

    console.log(`📁 Found ${files.length} total DICOM files`);

    if (files.length === 0) {
      return res.status(200).json({
        studies: {},
        pagination: {
          currentPage: pageNum,
          totalPages: 0,
          totalStudies: 0,
          hasNextPage: false,
          hasPrevPage: false,
          limit: limitNum
        }
      });
    }

    // Organize files into studies (lightweight - just organization, no heavy metadata)
    const allStudies = organizeDicomStudies(files);
    const studyEntries = Object.entries(allStudies);

    console.log(`📚 Organized into ${studyEntries.length} studies`);

    // First, add patient details to ALL studies for proper search functionality
    try {
      for (const study of Object.values(allStudies)) {
        if (study.firstFile) {
          const patientIdFromFile = study.firstFile.split('_')[0];
          const patient = await prisma.patient.findUnique({
            where: { urn: patientIdFromFile }
          });

          if (patient) {
            study.uploadedPatientName = `${patient.firstName} ${patient.lastName}`;
            study.uploadedPatientId = patientIdFromFile;
          } else {
            // Fallback if patient not found in database
            study.uploadedPatientName = 'Unknown Patient';
            study.uploadedPatientId = patientIdFromFile;
          }
        }
      }
    } catch (dbError) {
      console.error('Error fetching patient details:', dbError);
      // Continue without patient details if database query fails
    } finally {
      await prisma.$disconnect();
    }

    // Now apply search filtering with complete patient data
    let filteredStudies = studyEntries;

    // Apply search filter
    if (search.trim()) {
      const searchQuery = search.toLowerCase().trim();
      filteredStudies = filteredStudies.filter(([_, study]) => {
        // Search in patient name (both original and uploaded)
        const patientName = (study.patientName || '').toLowerCase();
        const uploadedPatientName = (study.uploadedPatientName || '').toLowerCase();

        // Search in URN/Patient ID (both original and uploaded)
        const patientId = (study.patientID || '').toLowerCase();
        const uploadedPatientId = (study.uploadedPatientId || '').toLowerCase();

        // Search in episode (extract from folder name or firstFile path)
        const firstFile = study.firstFile || '';
        const folderName = firstFile.includes('/') ? firstFile.split('/')[0] : '';
        const episode = folderName.includes('_') ? folderName.split('_').slice(1).join('_') : '';

        // Search in study description
        const studyDescription = (study.studyDescription || '').toLowerCase();

        return patientName.includes(searchQuery) ||
          uploadedPatientName.includes(searchQuery) ||
          patientId.includes(searchQuery) ||
          uploadedPatientId.includes(searchQuery) ||
          episode.toLowerCase().includes(searchQuery) ||
          studyDescription.includes(searchQuery);
      });
    }

    const totalStudies = filteredStudies.length;
    const totalPages = Math.ceil(totalStudies / limitNum);

    // Apply pagination - only get the studies for current page
    const paginatedStudyEntries = filteredStudies.slice(offset, offset + limitNum);

    console.log(`📄 Processing ${paginatedStudyEntries.length} studies for page ${pageNum}`);

    // Convert back to object format for only the paginated studies
    const paginatedStudies = Object.fromEntries(paginatedStudyEntries);

    const response = {
      studies: paginatedStudies,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalStudies,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
        limit: limitNum
      },
      patientFilter: patient || null,
      searchQuery: search || null
    };

    console.log(`✅ Returning ${Object.keys(paginatedStudies).length} studies for page ${pageNum}/${totalPages}`);
    res.status(200).json(response);

  } catch (error) {
    console.error('Error reading DICOM directory:', error);
    res.status(500).json({ error: 'Failed to read DICOM studies' });
  }
}

export default requireAdminAuth(handler);
