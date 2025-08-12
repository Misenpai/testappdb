import type { Request, Response } from "express";
import { PrismaClient, SessionType, AttendanceType } from "../../generated/prisma/index.js";
import path from "path";

const prisma = new PrismaClient();

// Helper function to determine session type based on time
function getSessionType(time: Date): SessionType {
  const hours = time.getHours();
  const minutes = time.getMinutes();
  const timeInMinutes = hours * 60 + minutes;
  
  // Forenoon: 9:30 AM (570 mins) to 1:00 PM (780 mins)
  if (timeInMinutes >= 570 && timeInMinutes < 780) {
    return SessionType.FORENOON;
  }
  // Afternoon: 1:00 PM (780 mins) to 5:30 PM (1050 mins)
  else if (timeInMinutes >= 780 && timeInMinutes <= 1050) {
    return SessionType.AFTERNOON;
  }
  
  // If outside working hours, determine based on closest session
  if (timeInMinutes < 570) {
    return SessionType.FORENOON; // Early morning counts as forenoon
  }
  return SessionType.AFTERNOON; // Late evening counts as afternoon
}

// Helper function to determine attendance type based on check-in and check-out
function determineAttendanceType(
  checkInSession: SessionType,
  checkOutTime: Date
): AttendanceType {
  const checkOutHours = checkOutTime.getHours();
  
  if (checkInSession === SessionType.FORENOON) {
    // If checked in during forenoon and checked out after 3 PM, it's full day
    if (checkOutHours >= 15) {
      return AttendanceType.FULL_DAY;
    }
    // Otherwise it's half day
    return AttendanceType.HALF_DAY;
  } else {
    // If checked in during afternoon, it's always half day
    return AttendanceType.HALF_DAY;
  }
}

export const createAttendance = async (req: Request, res: Response) => {
  try {
    console.log("Received request body:", req.body);
    console.log("Received files:", req.files);
    
    const { username, location, photoType, audioDuration } = req.body;

    // Add validation
    if (!username || username === 'undefined') {
      console.log("Username is missing or undefined:", username);
      return res.status(400).json({ error: "Username is required and cannot be undefined" });
    }

    console.log("Processing attendance for:", {
      username,
      location: location || 'Not provided',
      photoType: photoType || 'Not provided',
      audioDuration: audioDuration || 'Not provided'
    });

    const user = await prisma.user.findFirst({
      where: { username: username },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Get current time and determine session
    const currentTime = new Date();
    const sessionType = getSessionType(currentTime);
    
    // Get today's date in LOCAL timezone
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

    if (existingAttendance && !existingAttendance.isCheckedOut) {
      return res.status(409).json({
        error: "Attendance already marked for today. Please checkout first.",
        existingAttendance,
      });
    }

    if (existingAttendance && existingAttendance.isCheckedOut) {
      return res.status(409).json({
        error: "You have already completed your attendance for today.",
        existingAttendance,
      });
    }

    const files = (req.files as Express.Multer.File[]) || [];
    const audioFile = files.find((f) => f.mimetype.startsWith("audio/"));

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const photoTypeValue = photoType || "front";

    const photoData = files
      .filter((f) => f.mimetype.startsWith("image/"))
      .map((f) => ({
        photoUrl: `${baseUrl}/${path
          .relative(process.cwd(), f.path)
          .replace(/\\/g, "/")}`,
        photoType: photoTypeValue,
      }));

    const audioUrl = audioFile
      ? `${baseUrl}/${path
          .relative(process.cwd(), audioFile.path)
          .replace(/\\/g, "/")}`
      : null;

    const parsedAudioDuration = audioDuration ? parseInt(audioDuration) : null;

    // Start transaction
    const attendance = await prisma.$transaction(async (tx) => {
      // Create attendance record with session type
      const newAttendance = await tx.attendance.create({
        data: {
          empId: user.empId,
          username: user.username,
          takenLocation: location || null,
          date: localDate,
          checkInTime: currentTime,
          sessionType: sessionType,
          isCheckedOut: false,
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

      // Create attendance date record
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
          // Don't set attendanceType yet - will be set on checkout
        },
      });

      return newAttendance;
    });

    res.status(201).json({
      success: true,
      id: attendance.id,
      data: {
        ...attendance,
        sessionType,
        message: `Check-in successful for ${sessionType} session. Remember to checkout.`
      },
    });
  } catch (error: any) {
    console.error("Create attendance error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// New checkout endpoint
export const checkoutAttendance = async (req: Request, res: Response) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ error: "Username is required" });
    }

    const user = await prisma.user.findFirst({
      where: { username: username },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Get today's date
    const today = new Date();
    const localDate = new Date(
      Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
    );

    // Find today's attendance
    const attendance = await prisma.attendance.findUnique({
      where: {
        empId_date: {
          empId: user.empId,
          date: localDate,
        },
      },
      include: {
        attendanceDate: true,
      },
    });

    if (!attendance) {
      return res.status(404).json({
        error: "No check-in found for today. Please check-in first.",
      });
    }

    if (attendance.isCheckedOut) {
      return res.status(409).json({
        error: "You have already checked out for today.",
        checkOutTime: attendance.checkOutTime,
      });
    }

    const checkOutTime = new Date();
    const attendanceType = determineAttendanceType(
      attendance.sessionType,
      checkOutTime
    );

    // Update attendance with checkout time and type
    const updatedAttendance = await prisma.$transaction(async (tx) => {
      // Update main attendance record
      const updated = await tx.attendance.update({
        where: { id: attendance.id },
        data: {
          checkOutTime: checkOutTime,
          attendanceType: attendanceType,
          isCheckedOut: true,
        },
      });

      // Update attendance date with type
      if (attendance.attendanceDate) {
        await tx.attendanceDate.update({
          where: { id: attendance.attendanceDate.id },
          data: {
            attendanceType: attendanceType,
          },
        });
      }

      // Update calendar
      await updateAttendanceCalendar(
        tx,
        user.empId,
        localDate,
        attendanceType
      );

      return updated;
    });

    res.status(200).json({
      success: true,
      data: {
        ...updatedAttendance,
        message: `Checkout successful. Attendance marked as ${attendanceType}.`,
      },
    });
  } catch (error: any) {
    console.error("Checkout error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get attendance calendar data with half/full day info
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
            sessionType: true,
            attendanceType: true,
            isCheckedOut: true,
          },
        },
      },
    });

    // Calculate statistics
    const totalFullDays = attendanceDates.filter(
      d => d.attendanceType === AttendanceType.FULL_DAY
    ).length;
    const totalHalfDays = attendanceDates.filter(
      d => d.attendanceType === AttendanceType.HALF_DAY
    ).length;
    const totalDays = totalFullDays + (totalHalfDays * 0.5);
    
    const currentStreak = calculateCurrentStreak(attendanceDates);

    res.status(200).json({
      success: true,
      data: {
        dates: attendanceDates,
        statistics: {
          totalDays,
          totalFullDays,
          totalHalfDays,
          currentStreak,
          longestStreak: currentStreak,
          lastAttendance:
            attendanceDates.length > 0
              ? attendanceDates[attendanceDates.length - 1]!.date
              : null,
        },
      },
    });
  } catch (error: any) {
    console.error("Get attendance calendar error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Admin: Get all users with attendance including session and day type
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
      },
      orderBy: {
        username: "asc",
      },
    });

    // Calculate attendance statistics for each user
    const formattedUsers = await Promise.all(users.map(async (user) => {
      const fullDays = user.attendances.filter(
        a => a.attendanceType === AttendanceType.FULL_DAY
      ).length;
      const halfDays = user.attendances.filter(
        a => a.attendanceType === AttendanceType.HALF_DAY
      ).length;
      const totalDays = fullDays + (halfDays * 0.5);

      return {
        id: user.id,
        empId: user.empId,
        username: user.username,
        email: user.email,
        department: user.location,
        isActive: user.isActive,
        locationType: user.userLocation?.locationType || "ABSOLUTE",
        monthlyStatistics: {
          totalDays,
          fullDays,
          halfDays,
        },
        attendances: user.attendances.map((att) => ({
          date: att.date,
          checkInTime: att.checkInTime,
          checkOutTime: att.checkOutTime,
          sessionType: att.sessionType,
          attendanceType: att.attendanceType,
          isCheckedOut: att.isCheckedOut,
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
      };
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

// Get today's attendance for a user
export const getTodayAttendance = async (req: Request, res: Response) => {
  try {
    const { username } = req.params;

    if (!username) {
      return res.status(400).json({ error: "Username is required" });
    }

    const user = await prisma.user.findFirst({
      where: { username: username },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Get today's date
    const today = new Date();
    const localDate = new Date(
      Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
    );

    const attendance = await prisma.attendance.findUnique({
      where: {
        empId_date: {
          empId: user.empId,
          date: localDate,
        },
      },
      include: {
        photos: true,
        audio: true,
      },
    });

    if (!attendance) {
      return res.status(404).json({
        success: false,
        error: "No attendance found for today",
      });
    }

    res.status(200).json({
      success: true,
      data: attendance,
    });
  } catch (error: any) {
    console.error("Get today attendance error:", error);
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

  let streak = 0;
  const sortedDates = attendanceDates.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  for (let i = 0; i < sortedDates.length; i++) {
    // Count full days as 1, half days as 0.5
    if (sortedDates[i].attendanceType === AttendanceType.FULL_DAY) {
      streak += 1;
    } else if (sortedDates[i].attendanceType === AttendanceType.HALF_DAY) {
      streak += 0.5;
    }
    
    // Check if streak continues
    if (i < sortedDates.length - 1) {
      const prevDate = new Date(sortedDates[i].date);
      const currDate = new Date(sortedDates[i + 1].date);
      const dayDiff = Math.floor(
        (prevDate.getTime() - currDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      
      if (dayDiff !== 1) {
        break; // Streak broken
      }
    }
  }

  return streak;
}

// Helper function to update attendance calendar
async function updateAttendanceCalendar(
  tx: any,
  empId: string,
  attendanceDate: Date,
  attendanceType: AttendanceType
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
    const maskValue = attendanceType === AttendanceType.FULL_DAY ? "2" : "1";
    const newMask =
      daysMask.substring(0, day - 1) + maskValue + daysMask.substring(day);

    await tx.attendanceCalendar.create({
      data: {
        empId,
        year,
        month,
        daysMask: newMask,
        totalFullDays: attendanceType === AttendanceType.FULL_DAY ? 1 : 0,
        totalHalfDays: attendanceType === AttendanceType.HALF_DAY ? 1 : 0,
      },
    });
  } else {
    // Update existing calendar entry
    const daysMask = calendar.daysMask.padEnd(31, "0");
    const maskValue = attendanceType === AttendanceType.FULL_DAY ? "2" : "1";
    const newMask =
      daysMask.substring(0, day - 1) + maskValue + daysMask.substring(day);
    
    // Count full and half days
    const fullDays = (newMask.match(/2/g) || []).length;
    const halfDays = (newMask.match(/1/g) || []).length;

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
        totalFullDays: fullDays,
        totalHalfDays: halfDays,
      },
    });
  }
}

// Add these functions to your attendance.controller.ts

export const getUserAttendanceSummary = async (req: Request, res: Response) => {
  try {
    const { empId } = req.params;

    if (!empId) {
      return res.status(400).json({ error: "Employee ID is required" });
    }

    const user = await prisma.user.findFirst({
      where: { empId: empId },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    // Get current month attendance
    const currentMonthAttendances = await prisma.attendanceDate.findMany({
      where: {
        empId: empId,
        year: currentYear,
        month: currentMonth,
      },
      include: {
        attendance: {
          select: {
            sessionType: true,
            attendanceType: true,
            isCheckedOut: true,
            checkInTime: true,
            checkOutTime: true,
          },
        },
      },
      orderBy: {
        date: 'desc',
      },
    });

    // Get year-to-date statistics
    const yearToDateAttendances = await prisma.attendanceDate.findMany({
      where: {
        empId: empId,
        year: currentYear,
      },
    });

    const currentMonthStats = {
      totalDays: currentMonthAttendances.filter(a => a.attendanceType === 'FULL_DAY').length + 
                 (currentMonthAttendances.filter(a => a.attendanceType === 'HALF_DAY').length * 0.5),
      fullDays: currentMonthAttendances.filter(a => a.attendanceType === 'FULL_DAY').length,
      halfDays: currentMonthAttendances.filter(a => a.attendanceType === 'HALF_DAY').length,
      presentDays: currentMonthAttendances.length,
    };

    const yearToDateStats = {
      totalDays: yearToDateAttendances.filter(a => a.attendanceType === 'FULL_DAY').length + 
                 (yearToDateAttendances.filter(a => a.attendanceType === 'HALF_DAY').length * 0.5),
      fullDays: yearToDateAttendances.filter(a => a.attendanceType === 'FULL_DAY').length,
      halfDays: yearToDateAttendances.filter(a => a.attendanceType === 'HALF_DAY').length,
      presentDays: yearToDateAttendances.length,
    };

    res.status(200).json({
      success: true,
      data: {
        user: {
          empId: user.empId,
          username: user.username,
          email: user.email,
        },
        currentMonth: {
          month: currentMonth,
          year: currentYear,
          statistics: currentMonthStats,
          recentAttendances: currentMonthAttendances.slice(0, 10), // Last 10 days
        },
        yearToDate: {
          year: currentYear,
          statistics: yearToDateStats,
        },
      },
    });
  } catch (error: any) {
    console.error("Get user attendance summary error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getUserAttendanceDetails = async (req: Request, res: Response) => {
  try {
    const { empId } = req.params;
    const { year, month } = req.query;

    if (!empId) {
      return res.status(400).json({ error: "Employee ID is required" });
    }

    const user = await prisma.user.findFirst({
      where: { empId: empId },
      include: {
        userLocation: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const queryYear = year ? parseInt(year as string) : new Date().getFullYear();
    const queryMonth = month ? parseInt(month as string) : new Date().getMonth() + 1;

    const attendances = await prisma.attendance.findMany({
      where: {
        empId: empId,
        date: {
          gte: new Date(queryYear, queryMonth - 1, 1),
          lt: new Date(queryYear, queryMonth, 1),
        },
      },
      include: {
        photos: true,
        audio: true,
        attendanceDate: true,
      },
      orderBy: {
        date: 'desc',
      },
    });

    // Calculate statistics
    const fullDays = attendances.filter(a => a.attendanceType === 'FULL_DAY').length;
    const halfDays = attendances.filter(a => a.attendanceType === 'HALF_DAY').length;
    const totalDays = fullDays + (halfDays * 0.5);

    const statistics = {
      totalDays,
      fullDays,
      halfDays,
      presentDays: attendances.length,
      workingDaysInMonth: getWorkingDaysInMonth(queryYear, queryMonth),
      attendancePercentage: attendances.length > 0 ? 
        (totalDays / getWorkingDaysInMonth(queryYear, queryMonth)) * 100 : 0,
    };

    res.status(200).json({
      success: true,
      data: {
        user: {
          empId: user.empId,
          username: user.username,
          email: user.email,
          location: user.location,
          locationType: user.userLocation?.locationType || 'ABSOLUTE',
        },
        period: {
          year: queryYear,
          month: queryMonth,
        },
        statistics,
        attendances: attendances.map(att => ({
          id: att.id,
          date: att.date,
          checkInTime: att.checkInTime,
          checkOutTime: att.checkOutTime,
          sessionType: att.sessionType,
          attendanceType: att.attendanceType,
          isCheckedOut: att.isCheckedOut,
          location: att.takenLocation,
          photos: att.photos.map(p => ({
            id: p.id,
            url: p.photoUrl,
            type: p.photoType,
          })),
          audio: att.audio.map(a => ({
            id: a.id,
            url: a.audioUrl,
            duration: a.duration,
          })),
        })),
      },
    });
  } catch (error: any) {
    console.error("Get user attendance details error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Helper function to calculate working days in a month (excluding weekends)
function getWorkingDaysInMonth(year: number, month: number): number {
  const lastDay = new Date(year, month, 0).getDate();
  let workingDays = 0;
  
  for (let day = 1; day <= lastDay; day++) {
    const date = new Date(year, month - 1, day);
    const dayOfWeek = date.getDay();
    // Exclude Sundays (0) and Saturdays (6) - adjust based on your working days
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      workingDays++;
    }
  }
  
  return workingDays;
}