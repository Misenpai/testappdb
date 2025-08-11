import type { Request, Response } from "express";
import { PrismaClient } from "../../generated/prisma/index.js";
import path from "path";

const prisma = new PrismaClient();

export const createAttendance = async (req: Request, res: Response) => {
  try {
    const { username, location, photoType, audioDuration } = req.body;

    if (!username) {
      return res.status(400).json({ error: "Username is required" });
    }

    const user = await prisma.user.findFirst({
      where: { username: username },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Get today's date in LOCAL timezone (not UTC)
    const today = new Date();
    const localDate = new Date(
      Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
    );

    // Check if attendance already exists for today
    const existingAttendance = await prisma.attendance.findUnique({
      where: {
        empId_date: {
          empId: user.empId,
          date: localDate,
        },
      },
    });

    if (existingAttendance) {
      return res.status(409).json({
        error: "Attendance already marked for today",
        existingAttendance,
      });
    }

    const files = (req.files as Express.Multer.File[]) || [];
    const audioFile = files.find((f) => f.mimetype.startsWith("audio/"));

    const baseUrl = `${req.protocol}://${req.get("host")}`;

    // Parse photoType - it might come as a string
    const photoTypeValue = photoType || "front"; // Default to 'front' if not provided

    const photoData = files
      .filter((f) => f.mimetype.startsWith("image/"))
      .map((f) => ({
        photoUrl: `${baseUrl}/${path
          .relative(process.cwd(), f.path)
          .replace(/\\/g, "/")}`,
        photoType: photoTypeValue, // Use the photo type from request
      }));

    const audioUrl = audioFile
      ? `${baseUrl}/${path
          .relative(process.cwd(), audioFile.path)
          .replace(/\\/g, "/")}`
      : null;

    // Parse audio duration if provided
    const parsedAudioDuration = audioDuration ? parseInt(audioDuration) : null;

    // Start transaction to ensure data consistency
    const attendance = await prisma.$transaction(async (tx) => {
      // Create attendance record with current time for checkInTime
      const newAttendance = await tx.attendance.create({
        data: {
          empId: user.empId,
          username: user.username,
          takenLocation: location || null,
          date: localDate,
          checkInTime: new Date(), // This keeps the actual timestamp
          photos: {
            create: photoData,
          },
          ...(audioUrl && {
            audio: {
              create: [
                {
                  audioUrl: audioUrl,
                  duration: parsedAudioDuration,
                },
              ],
            },
          }),
        },
        include: {
          photos: true,
          audio: true,
        },
      });

      // Create attendance date record for calendar tracking
      const dayOfWeek = localDate.getDay();
      const weekOfYear = getWeekOfYear(localDate);

      await tx.attendanceDate.create({
        data: {
          empId: user.empId,
          date: localDate,
          year: localDate.getFullYear(),
          month: localDate.getMonth() + 1,
          day: localDate.getDate(),
          dayOfWeek: dayOfWeek,
          weekOfYear: weekOfYear,
          isPresent: true,
          attendanceId: newAttendance.id,
        },
      });

      // Update attendance calendar (simplified - removed statistics)
      await updateAttendanceCalendar(tx, user.empId, localDate);

      return newAttendance;
    });

    res.status(201).json({
      success: true,
      id: attendance.id,
      data: attendance,
    });
  } catch (error: any) {
    console.error("Create attendance error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get attendance calendar data for a user (for mobile app profile)
export const getAttendanceCalendar = async (req: Request, res: Response) => {
  try {
    const { empId } = req.params;
    const { year, month } = req.query;

    if (!empId) {
      return res.status(400).json({ error: "Employee ID is required" });
    }

    const queryYear = year
      ? parseInt(year as string)
      : new Date().getFullYear();
    const queryMonth = month ? parseInt(month as string) : null;

    let whereCondition: any = {
      empId: empId,
      year: queryYear,
    };

    if (queryMonth) {
      whereCondition.month = queryMonth;
    }

    const attendanceDates = await prisma.attendanceDate.findMany({
      where: whereCondition,
      orderBy: {
        date: "asc",
      },
      include: {
        attendance: {
          select: {
            takenLocation: true,
            checkInTime: true,
            checkOutTime: true,
          },
        },
      },
    });

    // Get calendar view for quick month overview
    const calendarView = queryMonth
      ? await prisma.attendanceCalendar.findUnique({
          where: {
            empId_year_month: {
              empId: empId,
              year: queryYear,
              month: queryMonth,
            },
          },
        })
      : null;

    // Calculate simple statistics without AttendanceStatistics table
    const totalDays = attendanceDates.length;
    const currentStreak = calculateCurrentStreak(attendanceDates);
    const thisMonthCount = queryMonth
      ? attendanceDates.filter((d) => d.month === queryMonth).length
      : 0;

    res.status(200).json({
      success: true,
      data: {
        dates: attendanceDates,
        statistics: {
          totalDays,
          currentStreak,
          longestStreak: currentStreak, // Simplified
          weeklyAverage: 0,
          thisMonthCount,
          thisWeekCount: 0,
          lastAttendance:
            attendanceDates.length > 0
              ? attendanceDates[attendanceDates.length - 1]!.date
              : null,
        },
        calendarView,
      },
    });
  } catch (error: any) {
    console.error("Get attendance calendar error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get user's attendance summary for profile
export const getUserAttendanceSummary = async (req: Request, res: Response) => {
  try {
    const { empId } = req.params;

    if (!empId) {
      return res.status(400).json({ error: "Employee ID is required" });
    }

    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;

    // Get user info with location type
    const user = await prisma.user.findUnique({
      where: { empId },
      include: {
        userLocation: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Get current month attendance
    const currentMonthAttendance = await prisma.attendanceDate.findMany({
      where: {
        empId: empId,
        year: currentYear,
        month: currentMonth,
      },
      orderBy: { date: "asc" },
    });

    // Get recent attendance (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentAttendance = await prisma.attendanceDate.findMany({
      where: {
        empId: empId,
        date: {
          gte: sevenDaysAgo,
        },
      },
      include: {
        attendance: {
          select: {
            checkInTime: true,
            takenLocation: true,
          },
        },
      },
      orderBy: { date: "desc" },
    });

    // Calculate simple statistics
    const totalDays = await prisma.attendanceDate.count({
      where: { empId },
    });

    res.status(200).json({
      success: true,
      data: {
        user: {
          empId: user.empId,
          username: user.username,
          email: user.email,
          location: user.location,
          locationType: user?.userLocation?.locationType || "ABSOLUTE",
          isActive: user.isActive,
        },
        statistics: {
          totalDays,
          currentStreak: calculateCurrentStreak(recentAttendance),
          longestStreak: 0, // Simplified
          thisMonthCount: currentMonthAttendance.length,
          thisWeekCount: recentAttendance.filter((a) => {
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            return new Date(a.date) >= weekAgo;
          }).length,
        },
        currentMonth: {
          year: currentYear,
          month: currentMonth,
          attendance: currentMonthAttendance,
        },
        recentAttendance,
      },
    });
  } catch (error: any) {
    console.error("Get user attendance summary error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Admin: Get all users with their attendance data (No authentication required)
export const getAllUsersWithAttendance = async (
  req: Request,
  res: Response
) => {
  try {
    const { month, year } = req.query;

    const queryMonth = month
      ? parseInt(month as string)
      : new Date().getMonth() + 1;
    const queryYear = year
      ? parseInt(year as string)
      : new Date().getFullYear();

    const users = await prisma.user.findMany({
      where: {
        role: "USER",
      },
      select: {
        id: true,
        empId: true,
        username: true,
        email: true,
        location: true,
        isActive: true,
        createdAt: true,
        userLocation: {
          select: {
            locationType: true,
            updatedAt: true,
            notes: true,
          },
        },
        attendances: {
          where: {
            date: {
              gte: new Date(queryYear, queryMonth - 1, 1),
              lt: new Date(queryYear, queryMonth, 1),
            },
          },
          include: {
            photos: true,
            audio: true,
          },
          orderBy: {
            date: "desc",
          },
        },
        _count: {
          select: {
            attendances: {
              where: {
                date: {
                  gte: new Date(queryYear, queryMonth - 1, 1),
                  lt: new Date(queryYear, queryMonth, 1),
                },
              },
            },
          },
        },
      },
      orderBy: {
        username: "asc",
      },
    });

    // Format the response
    const formattedUsers = users.map((user) => ({
      id: user.id,
      empId: user.empId,
      username: user.username,
      email: user.email,
      department: user.location,
      isActive: user.isActive,
      locationType: user.userLocation?.locationType || "ABSOLUTE",
      monthlyAttendanceCount: user._count.attendances,
      attendances: user.attendances.map((att) => ({
        date: att.date,
        checkInTime: att.checkInTime,
        location: att.takenLocation,
        photos: att.photos.map((p) => ({
          url: p.photoUrl,
          type: p.photoType,
        })),
        audio: att.audio.map((a) => ({
          url: a.audioUrl,
          duration: a.duration,
        })),
      })),
    }));

    res.status(200).json({
      success: true,
      month: queryMonth,
      year: queryYear,
      totalUsers: formattedUsers.length,
      data: formattedUsers,
    });
  } catch (error: any) {
    console.error("Get all users error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Admin: Get specific user attendance details (No authentication required)
export const getUserAttendanceDetails = async (req: Request, res: Response) => {
  try {
    const { empId } = req.params;
    const { startDate, endDate, limit = 50, offset = 0 } = req.query;

    if (!empId) {
      return res.status(400).json({ error: "Employee ID is required" });
    }

    let whereCondition: any = { empId: empId };

    if (startDate || endDate) {
      whereCondition.date = {};
      if (startDate) {
        whereCondition.date.gte = new Date(startDate as string);
      }
      if (endDate) {
        whereCondition.date.lte = new Date(endDate as string);
      }
    }

    const [attendances, total, user] = await Promise.all([
      prisma.attendance.findMany({
        where: whereCondition,
        orderBy: { date: "desc" },
        take: parseInt(limit as string),
        skip: parseInt(offset as string),
        include: {
          photos: true,
          audio: true,
          attendanceDate: true,
        },
      }),
      prisma.attendance.count({ where: whereCondition }),
      prisma.user.findUnique({
        where: { empId },
        include: {
          userLocation: true,
        },
      }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        user: {
          empId: user?.empId,
          username: user?.username,
          email: user?.email,
          department: user?.location,
          locationType: user?.userLocation?.locationType || "ABSOLUTE",
        },
        attendances: attendances.map((att) => ({
          id: att.id,
          date: att.date,
          checkInTime: att.checkInTime,
          location: att.takenLocation,
          photos: att.photos.map((p) => ({
            url: p.photoUrl,
            type: p.photoType,
          })),
          audio: att.audio.map((a) => ({
            url: a.audioUrl,
            duration: a.duration,
          })),
        })),
        pagination: {
          total,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
        },
      },
    });
  } catch (error: any) {
    console.error("Get user attendance details error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Helper function to calculate week of year
function getWeekOfYear(date: Date): number {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

// Helper function to calculate current streak
function calculateCurrentStreak(attendanceDates: any[]): number {
  if (attendanceDates.length === 0) return 0;

  let streak = 1;
  const sortedDates = attendanceDates.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  for (let i = 1; i < sortedDates.length; i++) {
    const prevDate = new Date(sortedDates[i - 1].date);
    const currDate = new Date(sortedDates[i].date);
    const dayDiff = Math.floor(
      (prevDate.getTime() - currDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (dayDiff === 1) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

// Helper function to update attendance calendar mask
async function updateAttendanceCalendar(
  tx: any,
  empId: string,
  attendanceDate: Date
) {
  const year = attendanceDate.getFullYear();
  const month = attendanceDate.getMonth() + 1;
  const day = attendanceDate.getDate();

  let calendar = await tx.attendanceCalendar.findUnique({
    where: {
      empId_year_month: {
        empId,
        year,
        month,
      },
    },
  });

  if (!calendar) {
    // Create new calendar entry
    const daysMask = "0".repeat(31);
    const newMask =
      daysMask.substring(0, day - 1) + "1" + daysMask.substring(day);

    await tx.attendanceCalendar.create({
      data: {
        empId,
        year,
        month,
        daysMask: newMask,
        totalDays: 1,
      },
    });
  } else {
    // Update existing calendar entry
    const daysMask = calendar.daysMask.padEnd(31, "0");
    const newMask =
      daysMask.substring(0, day - 1) + "1" + daysMask.substring(day);
    const totalDays = newMask.split("1").length - 1;

    await tx.attendanceCalendar.update({
      where: {
        empId_year_month: {
          empId,
          year,
          month,
        },
      },
      data: {
        daysMask: newMask,
        totalDays,
      },
    });
  }
}
