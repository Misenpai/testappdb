import type { Request, Response } from 'express';
import { PrismaClient } from '../../generated/prisma/index.js';
import path from 'path';

const prisma = new PrismaClient();

export const createAttendance = async (req: Request, res: Response) => {
  try {
    const { username, location } = req.body;
    const ts = Date.now();

    if (!username) {
      return res.status(400).json({ error: "Username is required" });
    }

    const user = await prisma.user.findFirst({
      where: { username: username }
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const files = (req.files as Express.Multer.File[]) || [];
    const audioFile = files.find(f => f.mimetype.startsWith("audio/"));

    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const photoUrls = files
      .filter(f => f.mimetype.startsWith("image/"))
      .map(f => `${baseUrl}/${path.relative(process.cwd(), f.path).replace(/\\/g, '/')}`);

    const audioUrl = audioFile
      ? `${baseUrl}/${path.relative(process.cwd(), audioFile.path).replace(/\\/g, '/')}`
      : null;

    const attendance = await prisma.attendance.create({
      data: {
        empId: user.empId,
        username: user.username,
        takenLocation: location || null,
        photos: {
          create: photoUrls.map(url => ({
            photoUrl: url
          }))
        },
        ...(audioUrl && {
          audio: {
            create: [{
              audioUrl: audioUrl
            }]
          }
        })
      },
      include: {
        photos: true,
        audio: true
      }
    });

    res.status(201).json({
      success: true,
      id: attendance.id,
      data: attendance
    });
  } catch (error: any) {
    console.error("Create attendance error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};