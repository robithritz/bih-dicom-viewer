import { authenticateUser } from '../../../../lib/user-service.js';
import { generateAdminToken } from '../../../../lib/admin-auth-middleware.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Email and password are required' 
      });
    }

    // Authenticate user
    const authResult = await authenticateUser(email, password);

    if (!authResult.success) {
      return res.status(401).json({ 
        error: authResult.error 
      });
    }

    const user = authResult.user;

    // Generate JWT token
    const token = generateAdminToken(user);

    // Set HTTP-only cookie
    res.setHeader('Set-Cookie', [
      `admin-auth-token=${token}; HttpOnly; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Strict${
        process.env.NODE_ENV === 'production' ? '; Secure' : ''
      }`
    ]);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ 
      error: 'Internal server error during login' 
    });
  }
}
