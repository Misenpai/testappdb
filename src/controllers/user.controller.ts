import type { Request, Response } from 'express';
import { PrismaClient } from '../../generated/prisma/index.js';
import bcrypt from 'bcrypt';
import { createUserFolder } from '../utils/folderUtils.js';

const prisma = new PrismaClient();
const SALT_ROUNDS = 12;

export const createUser = async (req: Request, res: Response) => {
  try {
    const { empId, username, email, password, location = "all" } = req.body;
    
    if (!empId || !username || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: "Employee ID, username, email, and password are required" 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        error: "Password must be at least 6 characters long" 
      });
    }

    // Check for existing user by email, empId, or username
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: email.toLowerCase().trim() },
          { empId: empId.trim() },
          { username: username.trim() }
        ]
      }
    });

    if (existingUser) {
      return res.status(409).json({ 
        success: false, 
        error: "User already exists with this email, employee ID, or username" 
      });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // Use transaction to ensure data consistency
    const user = await prisma.$transaction(async (tx) => {
      // Create user first
      const newUser = await tx.user.create({
        data: {
          empId: empId.trim(),
          username: username.trim(),
          email: email.toLowerCase().trim(),
          password: hashedPassword,
          location: location,
        },
        include: {
          userLocation: true
        }
      });

      // Create userLocation record
      await tx.userLocation.create({
        data: {
          empId: empId.trim(),
          username: username.trim(),
          locationType: 'ABSOLUTE'
        }
      });

      // Return user with userLocation included
      return await tx.user.findUnique({
        where: { empId: empId.trim() },
        include: {
          userLocation: true
        }
      });
    });

    createUserFolder(user!.username);

    const { password: _, ...userWithoutPassword } = user!;

    res.status(201).json({
      success: true, 
      username: user!.username,
      empId: user!.empId,
      user: userWithoutPassword,
      message: "User created successfully"
    });

  } catch (error: any) {
    console.error("Create user error:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

export const loginUser = async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        error: "Username and password are required" 
      });
    }

    const user = await prisma.user.findUnique({
      where: { username: username },
      include: {
        userLocation: true
      }
    });

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        error: "Invalid username or password" 
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({ 
        success: false, 
        error: "Account is deactivated. Please contact administrator." 
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({ 
        success: false, 
        error: "Invalid username or password" 
      });
    }

    createUserFolder(user.username);

    const { password: _, ...userWithoutPassword } = user;

    res.status(200).json({ 
      success: true, 
      userId: user.id,
      empId: user.empId,
      username: user.username,
      user: userWithoutPassword,
      message: "Login successful"
    });

  } catch (error: any) {
    console.error("Login user error:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

export const getUserById = async (req: Request, res: Response) => {
  try {
    const { empId } = req.params;

    if (!empId) {
      return res.status(400).json({
        success: false,
        error: "Employee ID is required"
      });
    }

    const user = await prisma.user.findUnique({
      where: { empId },
      select: {
        id: true,
        empId: true,
        username: true,
        email: true,
        location: true,
        role: true,
        isActive: true,
        createdAt: true,
        userLocation: {
          select: {
            locationType: true,
            updatedAt: true,
            notes: true
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }

    res.status(200).json({
      success: true,
      data: user
    });

  } catch (error: any) {
    console.error("Get user error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

export const updateUser = async (req: Request, res: Response) => {
  try {
    const { empId } = req.params;
    const { username, email, location, isActive } = req.body;

    if (!empId) {
      return res.status(400).json({
        success: false,
        error: "Employee ID is required"
      });
    }

    // Check if username or email already exists (excluding current user)
    if (username || email) {
      const existingUser = await prisma.user.findFirst({
        where: {
          AND: [
            { empId: { not: empId } },
            {
              OR: [
                ...(username ? [{ username: username.trim() }] : []),
                ...(email ? [{ email: email.toLowerCase().trim() }] : [])
              ]
            }
          ]
        }
      });

      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: "Username or email already exists"
        });
      }
    }

    const updatedUser = await prisma.$transaction(async (tx) => {
      // Update user
      const user = await tx.user.update({
        where: { empId },
        data: {
          ...(username && { username: username.trim() }),
          ...(email && { email: email.toLowerCase().trim() }),
          ...(location && { location }),
          ...(typeof isActive === 'boolean' && { isActive })
        },
        include: {
          userLocation: true
        }
      });

      // Update userLocation username if username changed
      if (username) {
        await tx.userLocation.update({
          where: { empId },
          data: { username: username.trim() }
        });
      }

      return user;
    });

    const { password: _, ...userWithoutPassword } = updatedUser;

    res.status(200).json({
      success: true,
      message: "User updated successfully",
      data: userWithoutPassword
    });

  } catch (error: any) {
    console.error("Update user error:", error);
    
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};