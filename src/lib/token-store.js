import prisma from './prisma.js';

const INACTIVITY_TIMEOUT_MS = parseInt(process.env.INACTIVITY_TIMEOUT_MS || '', 10) || 60 * 60 * 1000; // 1 hour default

// Save a token record on login
export async function saveToken({ token, userType, userId = null, patientEmail = null }) {
  try {
    const data = {
      token,
      userType,
      lastUsedAt: new Date(),
      revoked: false,
    };

    if (userType === 'admin' && userId) {
      data.userId = BigInt(userId);
    }
    if (userType === 'patient' && patientEmail) {
      data.patientEmail = patientEmail.toLowerCase();
    }

    // Upsert by token
    const rec = await prisma.authToken.upsert({
      where: { token },
      update: { lastUsedAt: new Date(), revoked: false },
      create: data,
    });

    return rec;
  } catch (err) {
    console.error('saveToken error:', err);
    return null;
  }
}

// Validate token inactivity and update lastUsedAt if still valid
export async function isTokenValidAndTouch(token) {
  try {
    const rec = await prisma.authToken.findUnique({ where: { token } });
    if (!rec || rec.revoked) return false;

    const now = Date.now();
    const last = new Date(rec.lastUsedAt).getTime();
    if (now - last > INACTIVITY_TIMEOUT_MS) {
      // Mark as revoked due to inactivity
      await prisma.authToken.update({
        where: { token },
        data: { revoked: true },
      });
      return false;
    }

    // Touch
    await prisma.authToken.update({
      where: { token },
      data: { lastUsedAt: new Date() },
    });
    return true;
  } catch (err) {
    console.error('isTokenValidAndTouch error:', err);
    return false;
  }
}

export async function revokeToken(token) {
  try {
    await prisma.authToken.update({
      where: { token },
      data: { revoked: true },
    });
    return true;
  } catch (err) {
    // If not found, nothing to revoke
    return false;
  }
}

