import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const OTP_FILE = path.join(process.cwd(), 'data', 'otps.json');

// OTP Configuration from .env
const OTP_EXPIRY_TIME = parseInt(process.env.OTP_EXPIRED_TIME_IN_SECOND) || 300; // 5 minutes
const OTP_MAX_RETRY = parseInt(process.env.OTP_MAX_RETRY) || 5;
const OTP_RETRY_TIME = parseInt(process.env.OTP_RETRY_TIME_IN_SECOND) || 600; // 10 minutes

// Ensure data directory exists
const ensureDataDir = () => {
  const dataDir = path.dirname(OTP_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
};

// Load OTPs from JSON file
export const loadOTPs = () => {
  try {
    ensureDataDir();
    if (fs.existsSync(OTP_FILE)) {
      const data = fs.readFileSync(OTP_FILE, 'utf8');
      return JSON.parse(data);
    }
    return {};
  } catch (error) {
    console.error('Error loading OTPs:', error);
    return {};
  }
};

// Save OTPs to JSON file
export const saveOTPs = (otps) => {
  try {
    ensureDataDir();
    fs.writeFileSync(OTP_FILE, JSON.stringify(otps, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving OTPs:', error);
    return false;
  }
};

// Generate a 6-digit OTP
export const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Create OTP session
export const createOTPSession = (email) => {
  try {
    const otps = loadOTPs();
    const now = Date.now();
    
    // Check if there's an existing session for this email
    const existingSession = otps[email];
    
    // Check retry limit and cooldown
    if (existingSession) {
      const timeSinceLastRequest = now - existingSession.lastRequestTime;
      
      // If within retry cooldown period, check retry count
      if (timeSinceLastRequest < OTP_RETRY_TIME * 1000) {
        if (existingSession.retryCount >= OTP_MAX_RETRY) {
          throw new Error(`Too many OTP requests. Please try again after ${Math.ceil((OTP_RETRY_TIME * 1000 - timeSinceLastRequest) / 60000)} minutes.`);
        }
      } else {
        // Reset retry count if cooldown period has passed
        existingSession.retryCount = 0;
      }
    }
    
    // Generate new OTP
    const otp = generateOTP();
    const sessionId = crypto.randomUUID();
    
    // Create or update OTP session
    otps[email] = {
      sessionId,
      otp,
      email,
      createdAt: now,
      expiresAt: now + (OTP_EXPIRY_TIME * 1000),
      verified: false,
      retryCount: existingSession ? existingSession.retryCount + 1 : 1,
      lastRequestTime: now,
      attempts: 0
    };
    
    // Clean up expired OTPs
    cleanupExpiredOTPs(otps);
    
    // Save to file
    if (saveOTPs(otps)) {
      return {
        sessionId,
        otp,
        expiresAt: otps[email].expiresAt,
        retryCount: otps[email].retryCount
      };
    } else {
      throw new Error('Failed to create OTP session');
    }
  } catch (error) {
    throw error;
  }
};

// Verify OTP
export const verifyOTP = (email, otp, sessionId) => {
  try {
    const otps = loadOTPs();
    const session = otps[email];
    
    if (!session) {
      throw new Error('No OTP session found for this email');
    }
    
    if (session.sessionId !== sessionId) {
      throw new Error('Invalid session');
    }
    
    if (session.verified) {
      throw new Error('OTP already used');
    }
    
    if (Date.now() > session.expiresAt) {
      throw new Error('OTP has expired');
    }
    
    // Increment attempt counter
    session.attempts += 1;
    
    // Check for too many attempts
    if (session.attempts > 3) {
      delete otps[email];
      saveOTPs(otps);
      throw new Error('Too many verification attempts. Please request a new OTP.');
    }
    
    if (session.otp !== otp) {
      saveOTPs(otps);
      throw new Error('Invalid OTP');
    }
    
    // Mark as verified
    session.verified = true;
    session.verifiedAt = Date.now();
    
    // Save updated session
    saveOTPs(otps);
    
    return {
      success: true,
      email: session.email,
      sessionId: session.sessionId,
      verifiedAt: session.verifiedAt
    };
    
  } catch (error) {
    throw error;
  }
};

// Clean up expired OTPs
export const cleanupExpiredOTPs = (otps = null) => {
  try {
    if (!otps) {
      otps = loadOTPs();
    }
    
    const now = Date.now();
    let cleaned = false;
    
    Object.keys(otps).forEach(email => {
      const session = otps[email];
      
      // Remove expired sessions or verified sessions older than 1 hour
      if (now > session.expiresAt || 
          (session.verified && now > session.verifiedAt + 3600000)) {
        delete otps[email];
        cleaned = true;
      }
    });
    
    if (cleaned) {
      saveOTPs(otps);
    }
    
    return cleaned;
  } catch (error) {
    console.error('Error cleaning up expired OTPs:', error);
    return false;
  }
};

// Get OTP session info (for debugging/admin)
export const getOTPSession = (email) => {
  try {
    const otps = loadOTPs();
    const session = otps[email];
    
    if (!session) {
      return null;
    }
    
    return {
      sessionId: session.sessionId,
      email: session.email,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      verified: session.verified,
      retryCount: session.retryCount,
      attempts: session.attempts,
      isExpired: Date.now() > session.expiresAt
    };
  } catch (error) {
    console.error('Error getting OTP session:', error);
    return null;
  }
};

// Delete OTP session
export const deleteOTPSession = (email) => {
  try {
    const otps = loadOTPs();
    
    if (otps[email]) {
      delete otps[email];
      return saveOTPs(otps);
    }
    
    return true;
  } catch (error) {
    console.error('Error deleting OTP session:', error);
    return false;
  }
};
