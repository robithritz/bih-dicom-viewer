export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
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
