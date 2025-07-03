import bcrypt from 'bcryptjs';
import prisma from './prisma.js';

/**
 * Get user by email
 */
export const getUserByEmail = async (email) => {
  try {
    const normalizedEmail = email.toLowerCase().trim();
    
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    return user;
  } catch (error) {
    console.error('Error getting user by email:', error);
    return null;
  }
};

/**
 * Get user by ID
 */
export const getUserById = async (id) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: BigInt(id) }
    });

    return user;
  } catch (error) {
    console.error('Error getting user by ID:', error);
    return null;
  }
};

/**
 * Authenticate user with email and password
 */
export const authenticateUser = async (email, password) => {
  try {
    const normalizedEmail = email.toLowerCase().trim();
    
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (!user) {
      return {
        success: false,
        error: 'Invalid email or password'
      };
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      return {
        success: false,
        error: 'Invalid email or password'
      };
    }

    // Return user data without password
    const { password: _, ...userWithoutPassword } = user;
    
    return {
      success: true,
      user: {
        ...userWithoutPassword,
        id: user.id.toString() // Convert BigInt to string for JSON serialization
      }
    };

  } catch (error) {
    console.error('Error authenticating user:', error);
    return {
      success: false,
      error: 'Authentication failed'
    };
  }
};

/**
 * Create new user (for admin registration)
 */
export const createUser = async (userData) => {
  try {
    const normalizedEmail = userData.email.toLowerCase().trim();
    
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (existingUser) {
      return {
        success: false,
        error: 'User with this email already exists'
      };
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(userData.password, 12);

    // Create user
    const newUser = await prisma.user.create({
      data: {
        name: userData.name,
        email: normalizedEmail,
        password: hashedPassword,
        role: userData.role || 'backoffice'
      }
    });

    // Return user data without password
    const { password: _, ...userWithoutPassword } = newUser;
    
    return {
      success: true,
      user: {
        ...userWithoutPassword,
        id: newUser.id.toString() // Convert BigInt to string for JSON serialization
      }
    };

  } catch (error) {
    console.error('Error creating user:', error);
    return {
      success: false,
      error: 'Failed to create user'
    };
  }
};

/**
 * Update user password
 */
export const updateUserPassword = async (userId, newPassword) => {
  try {
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    
    const updatedUser = await prisma.user.update({
      where: { id: BigInt(userId) },
      data: { password: hashedPassword }
    });

    return {
      success: true,
      message: 'Password updated successfully'
    };

  } catch (error) {
    console.error('Error updating user password:', error);
    return {
      success: false,
      error: 'Failed to update password'
    };
  }
};

/**
 * Get all users (for admin management)
 */
export const getAllUsers = async (page = 1, limit = 50) => {
  try {
    const skip = (page - 1) * limit;
    
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          emailVerifiedAt: true,
          createdAt: true,
          updatedAt: true
          // Exclude password field
        }
      }),
      prisma.user.count()
    ]);

    // Convert BigInt IDs to strings
    const usersWithStringIds = users.map(user => ({
      ...user,
      id: user.id.toString()
    }));

    return {
      users: usersWithStringIds,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  } catch (error) {
    console.error('Error getting all users:', error);
    return {
      users: [],
      total: 0,
      page: 1,
      limit,
      totalPages: 0
    };
  }
};

/**
 * Update user role
 */
export const updateUserRole = async (userId, newRole) => {
  try {
    const updatedUser = await prisma.user.update({
      where: { id: BigInt(userId) },
      data: { role: newRole }
    });

    return {
      success: true,
      user: {
        ...updatedUser,
        id: updatedUser.id.toString()
      }
    };

  } catch (error) {
    console.error('Error updating user role:', error);
    return {
      success: false,
      error: 'Failed to update user role'
    };
  }
};
