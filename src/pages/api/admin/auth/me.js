import { verifyAdminSession } from '../../../../lib/admin-auth-middleware.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await verifyAdminSession(req);

    if (!user) {
      return res.status(401).json({ 
        error: 'Not authenticated' 
      });
    }

    res.status(200).json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Admin me error:', error);
    res.status(500).json({ 
      error: 'Internal server error' 
    });
  }
}
