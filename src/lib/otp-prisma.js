import crypto from 'crypto';
import prisma from './prisma.js';

const OTP_EXPIRY_TIME = parseInt(process.env.OTP_EXPIRED_TIME_IN_SECOND) || 300; // 5 minutes
const MAX_RETRY_COUNT = parseInt(process.env.OTP_MAX_RETRY) || 5;
const RETRY_COOLDOWN_TIME = parseInt(process.env.OTP_RETRY_TIME_IN_SECOND) || 600; // 10 minutes

/**
 * Generate a 6-digit OTP
 */
export const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Create or update OTP session using Prisma
 */
export const createOTPSession = async (email) => {
  const normalizedEmail = email.toLowerCase().trim();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (OTP_EXPIRY_TIME * 1000));
  
  try {
    // Clean up expired OTPs first
    await cleanupExpiredOTPs();
    
    // Check for existing session
    const existingSession = await prisma.otp.findFirst({
      where: { email: normalizedEmail },
      orderBy: { createdAt: 'desc' }
    });

    // Check retry limits
    if (existingSession) {
      const timeSinceLastRequest = now - existingSession.lastRequestTime;
      
      if (existingSession.retryCount >= MAX_RETRY_COUNT && 
          timeSinceLastRequest < (RETRY_COOLDOWN_TIME * 1000)) {
        throw new Error(`Too many attempts. Please wait ${Math.ceil((RETRY_COOLDOWN_TIME * 1000 - timeSinceLastRequest) / 60000)} minutes before trying again.`);
      }
    }

    const otp = generateOTP();
    const sessionId = crypto.randomUUID();
    const retryCount = existingSession && 
                      (now - existingSession.lastRequestTime) < (RETRY_COOLDOWN_TIME * 1000) 
                      ? existingSession.retryCount + 1 
                      : 1;

    // Delete existing sessions for this email
    await prisma.otp.deleteMany({
      where: { email: normalizedEmail }
    });

    // Create new OTP session
    const otpSession = await prisma.otp.create({
      data: {
        email: normalizedEmail,
        sessionId,
        otp,
        expiresAt,
        retryCount,
        lastRequestTime: now
      }
    });

    return {
      sessionId: otpSession.sessionId,
      otp: otpSession.otp,
      email: otpSession.email,
      expiresAt: otpSession.expiresAt,
      retryCount: otpSession.retryCount
    };

  } catch (error) {
    console.error('Error creating OTP session:', error);
    throw error;
  }
};

/**
 * Verify OTP using Prisma
 */
export const verifyOTP = async (email, otp, sessionId) => {
  const normalizedEmail = email.toLowerCase().trim();
  
  try {
    // Clean up expired OTPs first
    await cleanupExpiredOTPs();
    
    const otpSession = await prisma.otp.findFirst({
      where: {
        email: normalizedEmail,
        sessionId: sessionId,
        verified: false
      }
    });

    if (!otpSession) {
      return {
        success: false,
        error: 'Invalid or expired OTP session'
      };
    }

    // Check if OTP has expired
    if (new Date() > otpSession.expiresAt) {
      await prisma.otp.delete({
        where: { id: otpSession.id }
      });
      return {
        success: false,
        error: 'OTP has expired'
      };
    }

    // Check attempt limits
    if (otpSession.attempts >= 3) {
      await prisma.otp.delete({
        where: { id: otpSession.id }
      });
      return {
        success: false,
        error: 'Too many failed attempts'
      };
    }

    // Verify OTP
    if (otpSession.otp !== otp) {
      // Increment attempts
      await prisma.otp.update({
        where: { id: otpSession.id },
        data: { attempts: otpSession.attempts + 1 }
      });
      
      return {
        success: false,
        error: 'Invalid OTP code',
        attemptsLeft: 3 - (otpSession.attempts + 1)
      };
    }

    // OTP is valid - mark as verified and delete
    await prisma.otp.delete({
      where: { id: otpSession.id }
    });

    return {
      success: true,
      email: otpSession.email,
      message: 'OTP verified successfully'
    };

  } catch (error) {
    console.error('Error verifying OTP:', error);
    return {
      success: false,
      error: 'OTP verification failed'
    };
  }
};

/**
 * Clean up expired OTP sessions
 */
export const cleanupExpiredOTPs = async () => {
  try {
    const now = new Date();
    const result = await prisma.otp.deleteMany({
      where: {
        expiresAt: {
          lt: now
        }
      }
    });
    
    if (result.count > 0) {
      console.log(`Cleaned up ${result.count} expired OTP sessions`);
    }
    
    return result.count;
  } catch (error) {
    console.error('Error cleaning up expired OTPs:', error);
    return 0;
  }
};

/**
 * Get OTP session info (for debugging)
 */
export const getOTPSession = async (email, sessionId) => {
  try {
    const normalizedEmail = email.toLowerCase().trim();
    
    const otpSession = await prisma.otp.findFirst({
      where: {
        email: normalizedEmail,
        sessionId: sessionId
      }
    });

    if (!otpSession) {
      return null;
    }

    return {
      email: otpSession.email,
      sessionId: otpSession.sessionId,
      expiresAt: otpSession.expiresAt,
      retryCount: otpSession.retryCount,
      attempts: otpSession.attempts,
      verified: otpSession.verified,
      isExpired: new Date() > otpSession.expiresAt
    };

  } catch (error) {
    console.error('Error getting OTP session:', error);
    return null;
  }
};
