import { revokeToken } from '../../../../lib/token-store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Revoke token if provided via Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      await revokeToken(token);
    }

    // Clear the admin auth cookie
    res.setHeader('Set-Cookie', [
      'admin-auth-token=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict'
    ]);

    res.status(200).json({
      success: true,
      message: 'Logout successful'
    });

  } catch (error) {
    console.error('Admin logout error:', error);
    res.status(500).json({
      error: 'Internal server error during logout'
    });
  }
}
