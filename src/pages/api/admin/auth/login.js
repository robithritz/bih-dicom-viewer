import { authenticateUser } from '../../../../lib/user-service.js';
import { generateAdminToken } from '../../../../lib/admin-auth-middleware.js';
import { saveToken } from '../../../../lib/token-store.js';

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

    // Persist token for inactivity tracking
    await saveToken({ token, userType: 'admin', userId: user.id });

    // Return token in response for localStorage storage
    res.status(200).json({
      success: true,
      message: 'Login successful',
      token: token,
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
