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

    const user = await prisma.user.create({
      data: {
        empId: empId.trim(),
        username: username.trim(),
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        location: location,
        userLocation: {
          create: {
            username: username.trim(),
            location: 'ABSOLUTE'
          }
        }
      },
      include: {
        userLocation: true
      }
    });

    createUserFolder(user.username);

    const { password: _, ...userWithoutPassword } = user;

    res.status(201).json({
      success: true, 
      username: user.username,
      empId: user.empId,
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
        error: "Invalid email or password" 
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({ 
        success: false, 
        error: "Invalid email or password" 
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