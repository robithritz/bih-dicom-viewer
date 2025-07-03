import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

const PATIENTS_FILE = path.join(process.cwd(), 'data', 'patients.json');

// Ensure data directory exists
const ensureDataDir = () => {
  const dataDir = path.dirname(PATIENTS_FILE);
  console.log(dataDir);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
};

// Load patients from JSON file
export const loadPatients = () => {
  try {
    ensureDataDir();
    if (fs.existsSync(PATIENTS_FILE)) {
      const data = fs.readFileSync(PATIENTS_FILE, 'utf8');
      return JSON.parse(data);
    }
    return {};
  } catch (error) {
    console.error('Error loading patients:', error);
    return {};
  }
};

// Save patients to JSON file
export const savePatients = (patients) => {
  try {
    ensureDataDir();
    fs.writeFileSync(PATIENTS_FILE, JSON.stringify(patients, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving patients:', error);
    return false;
  }
};

// Register a new patient
export const registerPatient = async (email, password, patientId) => {
  try {
    const patients = loadPatients();

    // Check if email already exists
    if (patients[email]) {
      throw new Error('Email already registered');
    }

    // Check if patient ID already exists
    const existingPatientId = Object.values(patients).find(p => p.patientId === patientId);
    if (existingPatientId) {
      throw new Error('Patient ID already registered');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create patient record
    patients[email] = {
      email,
      password: hashedPassword,
      patientId,
      createdAt: new Date().toISOString(),
      lastLogin: null
    };

    // Save to file
    if (savePatients(patients)) {
      return { email, patientId };
    } else {
      throw new Error('Failed to save patient data');
    }
  } catch (error) {
    throw error;
  }
};

// Authenticate patient
export const authenticatePatient = async (email, password) => {
  try {
    const patients = loadPatients();
    const patient = patients[email];

    if (!patient) {
      throw new Error('Invalid email or password');
    }

    const isValidPassword = await bcrypt.compare(password, patient.password);
    if (!isValidPassword) {
      throw new Error('Invalid email or password');
    }

    // Update last login
    patient.lastLogin = new Date().toISOString();
    patients[email] = patient;
    savePatients(patients);

    return {
      email: patient.email,
      patientId: patient.patientId
    };
  } catch (error) {
    throw error;
  }
};

// Get patient by email
export const getPatientByEmail = (email) => {
  try {
    const patients = loadPatients();
    const patient = patients[email];

    if (patient) {
      return {
        email: patient.email,
        patientId: patient.patientId,
        createdAt: patient.createdAt,
        lastLogin: patient.lastLogin
      };
    }

    return null;
  } catch (error) {
    console.error('Error getting patient:', error);
    return null;
  }
};

// Get patient by patient ID
export const getPatientByPatientId = (patientId) => {
  try {
    const patients = loadPatients();
    const patient = Object.values(patients).find(p => p.patientId === patientId);

    if (patient) {
      return {
        email: patient.email,
        patientId: patient.patientId,
        createdAt: patient.createdAt,
        lastLogin: patient.lastLogin
      };
    }

    return null;
  } catch (error) {
    console.error('Error getting patient by ID:', error);
    return null;
  }
};

// List all patients (admin function)
export const listPatients = () => {
  try {
    const patients = loadPatients();
    return Object.values(patients).map(patient => ({
      email: patient.email,
      patientId: patient.patientId,
      createdAt: patient.createdAt,
      lastLogin: patient.lastLogin
    }));
  } catch (error) {
    console.error('Error listing patients:', error);
    return [];
  }
};
