import prisma from './prisma.js';

/**
 * Get patient by email
 */
export const getPatientByEmail = async (email) => {
  try {
    const normalizedEmail = email.toLowerCase().trim();

    const patient = await prisma.patient.findFirst({
      where: { email: normalizedEmail }
    });

    const multiPatients = await prisma.patient.findMany({
      where: { email: normalizedEmail }
    });

    if (multiPatients.length > 1) {
      console.warn('Multiple patients found for email:', normalizedEmail);
    }

    return {
      ...patient,
      isMultiPatient: multiPatients.length > 1,
      multiUrn: multiPatients.map(p => p.urn)
    };
  } catch (error) {
    console.error('Error getting patient by email:', error);
    return null;
  }
};

/**
 * Get patient by patient ID (psid)
 */
export const getPatientById = async (patientId) => {
  try {
    const patient = await prisma.patient.findUnique({
      where: { psid: patientId }
    });

    return patient;
  } catch (error) {
    console.error('Error getting patient by ID:', error);
    return null;
  }
};

/**
 * Create or update patient (Note: Patient table is read-only, patients should exist)
 */
export const createOrUpdatePatient = async (patientData) => {
  try {
    const normalizedEmail = patientData.email.toLowerCase().trim();

    // Check if patient exists by email
    const existingPatient = await prisma.patient.findFirst({
      where: { email: normalizedEmail }
    });

    if (existingPatient) {
      // Update existing patient (only updatedAt timestamp)
      const updatedPatient = await prisma.patient.update({
        where: { idPatients: existingPatient.idPatients },
        data: {
          updatedAt: new Date()
        }
      });

      return updatedPatient;
    } else {
      // Patient doesn't exist - this should not happen in normal flow
      // Return null to indicate patient not found
      console.warn('Patient not found for email:', normalizedEmail);
      return null;
    }
  } catch (error) {
    console.error('Error creating/updating patient:', error);
    throw error;
  }
};

/**
 * Update patient last login (updates updatedAt timestamp)
 */
export const updatePatientLastLogin = async (email) => {
  try {
    const normalizedEmail = email.toLowerCase().trim();

    const patient = await prisma.patient.findFirst({
      where: { email: normalizedEmail }
    });

    if (patient) {
      const updatedPatient = await prisma.patient.update({
        where: { idPatients: patient.idPatients },
        data: { updatedAt: new Date() }
      });
      return updatedPatient;
    }

    return null;
  } catch (error) {
    console.error('Error updating patient last login:', error);
    return null;
  }
};

/**
 * Get all patients (for admin)
 */
export const getAllPatients = async (page = 1, limit = 50) => {
  try {
    const skip = (page - 1) * limit;

    const [patients, total] = await Promise.all([
      prisma.patient.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.patient.count()
    ]);

    return {
      patients,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  } catch (error) {
    console.error('Error getting all patients:', error);
    return {
      patients: [],
      total: 0,
      page: 1,
      limit,
      totalPages: 0
    };
  }
};

/**
 * Deactivate patient (Note: Patient table doesn't have isActive field)
 */
export const deactivatePatient = async (patientId) => {
  try {
    // Since Patient table doesn't have isActive, we just update the timestamp
    const updatedPatient = await prisma.patient.update({
      where: { psid: patientId },
      data: { updatedAt: new Date() }
    });

    return updatedPatient;
  } catch (error) {
    console.error('Error deactivating patient:', error);
    throw error;
  }
};

/**
 * Activate patient (Note: Patient table doesn't have isActive field)
 */
export const activatePatient = async (patientId) => {
  try {
    // Since Patient table doesn't have isActive, we just update the timestamp
    const updatedPatient = await prisma.patient.update({
      where: { psid: patientId },
      data: { updatedAt: new Date() }
    });

    return updatedPatient;
  } catch (error) {
    console.error('Error activating patient:', error);
    throw error;
  }
};
