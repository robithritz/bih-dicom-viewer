import { getDicomFilesByPatientId, organizeDicomStudies } from '../../lib/dicom';
import { requireAuth } from '../../lib/auth-middleware';
import { getDicomStudiesForPatient } from '../../lib/patient-dicom-service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Use patient ID from authenticated session instead of query parameter
    const patientId = req.patient.urn;
    const isMultiPatient = req.patient.isMultiPatient;
    const multiUrn = req.patient.multiUrn;

    // Get query parameters for filtering and search
    const { search, modality, dateFrom, dateTo, limit, offset } = req.query;

    // Build options for the database query
    const queryOptions = {};
    if (search) queryOptions.search = search;
    if (modality) queryOptions.modality = modality;
    if (dateFrom) queryOptions.dateFrom = dateFrom;
    if (dateTo) queryOptions.dateTo = dateTo;
    if (limit) queryOptions.limit = parseInt(limit);
    if (offset) queryOptions.offset = parseInt(offset);

    if (Object.keys(queryOptions).length > 0) {
      console.log('Query options:', queryOptions);
    }

    let studies = {};
    let totalFiles = 0;

    try {
      // Try to get studies from database first (new approach)
      if (isMultiPatient && multiUrn && multiUrn.length > 0) {
        studies = await getDicomStudiesForPatient(multiUrn, queryOptions);
      } else {
        studies = await getDicomStudiesForPatient(patientId, queryOptions);
      }

      // Calculate total files from database studies
      totalFiles = Object.values(studies).reduce((sum, study) => sum + (study.totalFiles || 0), 0);

      await prisma.$disconnect();

      res.status(200).json({
        studies,
        patientId: patientId,
        totalStudies: Object.keys(studies).length,
        totalFiles: totalFiles,
        queryOptions: queryOptions,
        message: `Loaded ${Object.keys(studies).length} studies from database with ${totalFiles} total files for patient ${patientId}${search ? ` (filtered by: "${search}")` : ''}`,
        source: 'database'
      });

    } catch (dbError) {
      console.warn('⚠️ Database query failed, falling back to file system:', dbError.message);

      // Fallback to file-based approach if database fails
      let files = [];
      if (isMultiPatient && multiUrn && multiUrn.length > 0) {
        for (const urn of multiUrn) {
          files = files.concat(getDicomFilesByPatientId(urn));
        }
      } else {
        files = getDicomFilesByPatientId(patientId);
      }

      console.log("FILES for patient", patientId, ":", files);
      studies = organizeDicomStudies(files);

      res.status(200).json({
        studies,
        patientId: patientId,
        message: `Loaded ${files.length} files from filesystem for patient ${patientId} (database fallback)`,
        source: 'filesystem'
      });
    }
  } catch (error) {
    console.error('Error loading DICOM studies:', error);
    await prisma.$disconnect();
    res.status(500).json({
      error: 'Error loading DICOM studies',
      message: error.message
    });
  }
}

export default requireAuth(handler);
