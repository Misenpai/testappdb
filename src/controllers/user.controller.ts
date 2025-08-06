
import type { Request, Response } from 'express';
import { PrismaClient } from '../../generated/prisma/index.js';
import bcrypt from 'bcrypt';
import { createUserFolder } from '../utils/folderUtils.js';

const prisma = new PrismaClient();
const SALT_ROUNDS = 12;

export const createUser = async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: "Name, email, and password are required" 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        error: "Password must be at least 6 characters long" 
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() }
    });

    if (existingUser) {
      return res.status(409).json({ 
        success: false, 
        error: "User already exists with this email" 
      });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password: hashedPassword,
      }
    });

    createUserFolder(user.name);

    const { password: _, ...userWithoutPassword } = user;

    res.status(201).json({ 
      success: true, 
      username: user.name,
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
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: "Email and password are required" 
      });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() }
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

    createUserFolder(user.name);

    const { password: _, ...userWithoutPassword } = user;

    res.status(200).json({ 
      success: true, 
      userId: user.id,
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