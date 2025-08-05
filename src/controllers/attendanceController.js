import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const createAttendance = async (req, res) => {
  try {
    const { userId, location, ts } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const files = req.files || [];
    const photoUrls = [];
    let audioUrl = "";

    files.forEach((file) => {
      const relativePath = file.path
        .replace(process.env.UPLOAD_DIR || "uploads", "")
        .replace(/\\/g, "/");
      
      if (file.mimetype.startsWith("audio/")) {
        audioUrl = relativePath;
      } else if (file.mimetype.startsWith("image/")) {
        photoUrls.push(relativePath);
      }
    });

    const attendance = await prisma.attendance.create({
      data: {
        userId,
        audioUrl: audioUrl || null,
        location: location || null,
        photos: {
          create: photoUrls.map(url => ({
            photoUrl: url
          }))
        }
      },
      include: {
        photos: true
      }
    });

    res.json({ success: true, id: attendance.id });
  } catch (error) {
    console.error("Create attendance error:", error);
    res.status(500).json({ error: error.message });
  }
};