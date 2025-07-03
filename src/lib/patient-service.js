import prisma from './prisma.js';

/**
 * Get patient by email
 */
export const getPatientByEmail = async (email) => {
  try {
    const normalizedEmail = email.toLowerCase().trim();
    
    const patient = await prisma.dicomPatient.findUnique({
      where: { email: normalizedEmail }
    });

    return patient;
  } catch (error) {
    console.error('Error getting patient by email:', error);
    return null;
  }
};

/**
 * Get patient by patient ID
 */
export const getPatientById = async (patientId) => {
  try {
    const patient = await prisma.dicomPatient.findUnique({
      where: { patientId: patientId }
    });

    return patient;
  } catch (error) {
    console.error('Error getting patient by ID:', error);
    return null;
  }
};

/**
 * Create or update patient
 */
export const createOrUpdatePatient = async (patientData) => {
  try {
    const normalizedEmail = patientData.email.toLowerCase().trim();
    
    // Check if patient exists by email
    const existingPatient = await prisma.dicomPatient.findUnique({
      where: { email: normalizedEmail }
    });

    if (existingPatient) {
      // Update existing patient
      const updatedPatient = await prisma.dicomPatient.update({
        where: { email: normalizedEmail },
        data: {
          name: patientData.name || existingPatient.name,
          phone: patientData.phone || existingPatient.phone,
          dateOfBirth: patientData.dateOfBirth || existingPatient.dateOfBirth,
          gender: patientData.gender || existingPatient.gender,
          address: patientData.address || existingPatient.address,
          lastLogin: new Date(),
          isActive: patientData.isActive !== undefined ? patientData.isActive : existingPatient.isActive
        }
      });
      
      return updatedPatient;
    } else {
      // Create new patient
      const newPatient = await prisma.dicomPatient.create({
        data: {
          patientId: patientData.patientId,
          email: normalizedEmail,
          name: patientData.name || null,
          phone: patientData.phone || null,
          dateOfBirth: patientData.dateOfBirth || null,
          gender: patientData.gender || null,
          address: patientData.address || null,
          lastLogin: new Date(),
          isActive: patientData.isActive !== undefined ? patientData.isActive : true
        }
      });
      
      return newPatient;
    }
  } catch (error) {
    console.error('Error creating/updating patient:', error);
    throw error;
  }
};

/**
 * Update patient last login
 */
export const updatePatientLastLogin = async (email) => {
  try {
    const normalizedEmail = email.toLowerCase().trim();
    
    const updatedPatient = await prisma.dicomPatient.update({
      where: { email: normalizedEmail },
      data: { lastLogin: new Date() }
    });

    return updatedPatient;
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
      prisma.dicomPatient.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.dicomPatient.count()
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
 * Deactivate patient
 */
export const deactivatePatient = async (patientId) => {
  try {
    const updatedPatient = await prisma.dicomPatient.update({
      where: { patientId },
      data: { isActive: false }
    });

    return updatedPatient;
  } catch (error) {
    console.error('Error deactivating patient:', error);
    throw error;
  }
};

/**
 * Activate patient
 */
export const activatePatient = async (patientId) => {
  try {
    const updatedPatient = await prisma.dicomPatient.update({
      where: { patientId },
      data: { isActive: true }
    });

    return updatedPatient;
  } catch (error) {
    console.error('Error activating patient:', error);
    throw error;
  }
};
