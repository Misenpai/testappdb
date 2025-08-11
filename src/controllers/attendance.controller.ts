import type { Request, Response } from 'express';
import { PrismaClient } from '../../generated/prisma/index.js';
import path from 'path';

const prisma = new PrismaClient();

export const createAttendance = async (req: Request, res: Response) => {
  try {
    const { username, location } = req.body;

    if (!username) {
      return res.status(400).json({ error: "Username is required" });
    }

    const user = await prisma.user.findFirst({
      where: { username: username }
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Get today's date (set time to 00:00:00 for date comparison)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if attendance already exists for today
    const existingAttendance = await prisma.attendance.findUnique({
      where: {
        empId_date: {
          empId: user.empId,
          date: today
        }
      }
    });

    if (existingAttendance) {
      return res.status(409).json({ 
        error: "Attendance already marked for today",
        existingAttendance 
      });
    }

    const files = (req.files as Express.Multer.File[]) || [];
    const audioFile = files.find(f => f.mimetype.startsWith("audio/"));

    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const photoData = files
      .filter(f => f.mimetype.startsWith("image/"))
      .map(f => ({
        photoUrl: `${baseUrl}/${path.relative(process.cwd(), f.path).replace(/\\/g, '/')}`,
        photoType: null
      }));

    const audioUrl = audioFile
      ? `${baseUrl}/${path.relative(process.cwd(), audioFile.path).replace(/\\/g, '/')}`
      : null;

    // Start transaction to ensure data consistency
    const attendance = await prisma.$transaction(async (tx) => {
      // Create attendance record
      const newAttendance = await tx.attendance.create({
        data: {
          empId: user.empId,
          username: user.username,
          takenLocation: location || null,
          date: today,
          checkInTime: new Date(),
          photos: {
            create: photoData
          },
          ...(audioUrl && {
            audio: {
              create: [{
                audioUrl: audioUrl,
                duration: null
              }]
            }
          })
        },
        include: {
          photos: true,
          audio: true
        }
      });

      // Create attendance date record for calendar tracking
      const dayOfWeek = today.getDay();
      const weekOfYear = getWeekOfYear(today);
      
      await tx.attendanceDate.create({
        data: {
          empId: user.empId,
          date: today,
          year: today.getFullYear(),
          month: today.getMonth() + 1,
          day: today.getDate(),
          dayOfWeek: dayOfWeek,
          weekOfYear: weekOfYear,
          isPresent: true,
          attendanceId: newAttendance.id
        }
      });

      // Update attendance statistics
      await updateAttendanceStatistics(tx, user.empId, today);

      // Update calendar mask
      await updateAttendanceCalendar(tx, user.empId, today);

      return newAttendance;
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

// Get attendance calendar data for a user (for mobile app profile)
export const getAttendanceCalendar = async (req: Request, res: Response) => {
  try {
    const { empId } = req.params;
    const { year, month } = req.query;

    if (!empId) {
      return res.status(400).json({ error: "Employee ID is required" });
    }

    const queryYear = year ? parseInt(year as string) : new Date().getFullYear();
    const queryMonth = month ? parseInt(month as string) : null;

    let whereCondition: any = {
      empId: empId,
      year: queryYear
    };

    if (queryMonth) {
      whereCondition.month = queryMonth;
    }

    const attendanceDates = await prisma.attendanceDate.findMany({
      where: whereCondition,
      orderBy: {
        date: 'asc'
      },
      include: {
        attendance: {
          select: {
            takenLocation: true,
            checkInTime: true,
            checkOutTime: true
          }
        }
      }
    });

    // Get statistics
    const statistics = await prisma.attendanceStatistics.findUnique({
      where: { empId: empId }
    });

    // Get calendar view for quick month overview
    const calendarView = queryMonth ? await prisma.attendanceCalendar.findUnique({
      where: {
        empId_year_month: {
          empId: empId,
          year: queryYear,
          month: queryMonth
        }
      }
    }) : null;

    res.status(200).json({
      success: true,
      data: {
        dates: attendanceDates,
        statistics: statistics || {
          totalDays: 0,
          currentStreak: 0,
          longestStreak: 0,
          weeklyAverage: 0,
          thisMonthCount: 0,
          thisWeekCount: 0
        },
        calendarView
      }
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
        attendanceStatistics: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Get current month attendance
    const currentMonthAttendance = await prisma.attendanceDate.findMany({
      where: {
        empId: empId,
        year: currentYear,
        month: currentMonth
      },
      orderBy: { date: 'asc' }
    });

    // Get recent attendance (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentAttendance = await prisma.attendanceDate.findMany({
      where: {
        empId: empId,
        date: {
          gte: sevenDaysAgo
        }
      },
      include: {
        attendance: {
          select: {
            checkInTime: true,
            takenLocation: true
          }
        }
      },
      orderBy: { date: 'desc' }
    });

    res.status(200).json({
      success: true,
      data: {
        user: {
          empId: user.empId,
          username: user.username,
          email: user.email,
          location: user.location,
          locationType: user.userLocation?.locationType || 'ABSOLUTE',
          isActive: user.isActive
        },
        statistics: user.attendanceStatistics,
        currentMonth: {
          year: currentYear,
          month: currentMonth,
          attendance: currentMonthAttendance
        },
        recentAttendance
      }
    });

  } catch (error: any) {
    console.error("Get user attendance summary error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Admin: Update user location type
export const updateUserLocationType = async (req: Request, res: Response) => {
  try {
    const { empId } = req.params;
    const { locationType, notes, adminId } = req.body;

    if (!empId || !locationType || !adminId) {
      return res.status(400).json({ 
        error: "Employee ID, location type, and admin ID are required" 
      });
    }

    // Verify admin user
    const admin = await prisma.user.findUnique({
      where: { id: adminId }
    });

    if (!admin || (admin.role !== 'ADMIN' && admin.role !== 'SUPER_ADMIN')) {
      return res.status(403).json({ error: "Unauthorized: Admin access required" });
    }

    // Check if user exists
    const targetUser = await prisma.user.findUnique({
      where: { empId }
    });

    if (!targetUser) {
      return res.status(404).json({ error: "Target user not found" });
    }

    // Update or create user location type
    const updatedLocation = await prisma.userLocation.upsert({
      where: { empId },
      update: {
        locationType,
        updatedBy: admin.empId,
        notes
      },
      create: {
        empId,
        username: targetUser.username,
        locationType,
        updatedBy: admin.empId,
        notes
      }
    });

    // Log admin activity
    await prisma.adminActivity.create({
      data: {
        adminId: admin.id,
        adminEmpId: admin.empId,
        adminEmail: admin.email,
        action: 'CHANGED_LOCATION_TYPE',
        targetUserId: empId,
        details: {
          previousLocationType: null, // You could fetch this before updating
          newLocationType: locationType,
          notes: notes || null
        },
        ipAddress: req.ip || null,
        userAgent: req.get('user-agent') || null
      }
    });

    res.status(200).json({
      success: true,
      data: updatedLocation,
      message: "Location type updated successfully"
    });

  } catch (error: any) {
    console.error("Update user location type error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Admin: Get all users with location types and attendance stats
export const getAllUsersWithLocations = async (req: Request, res: Response) => {
  try {
    const { adminId } = req.query;

    if (!adminId) {
      return res.status(400).json({ error: "Admin ID is required" });
    }

    // Verify admin user
    const admin = await prisma.user.findUnique({
      where: { id: adminId as string }
    });

    if (!admin || (admin.role !== 'ADMIN' && admin.role !== 'SUPER_ADMIN')) {
      return res.status(403).json({ error: "Unauthorized: Admin access required" });
    }

    const users = await prisma.user.findMany({
      where: {
        role: 'USER'
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
            updatedBy: true,
            updatedAt: true,
            notes: true
          }
        },
        attendanceStatistics: {
          select: {
            totalDays: true,
            currentStreak: true,
            longestStreak: true,
            lastAttendance: true,
            thisMonthCount: true,
            weeklyAverage: true
          }
        },
        _count: {
          select: {
            attendances: true
          }
        }
      },
      orderBy: {
        username: 'asc'
      }
    });

    // Log admin activity
    await prisma.adminActivity.create({
      data: {
        adminId: admin.id,
        adminEmpId: admin.empId,
        adminEmail: admin.email,
        action: 'VIEWED_ALL_USERS',
        details: {
          usersCount: users.length
        },
        ipAddress: req.ip || null,
        userAgent: req.get('user-agent') || null
      }
    });

    res.status(200).json({
      success: true,
      data: users
    });

  } catch (error: any) {
    console.error("Get all users error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Admin: Get user attendance details
export const getUserAttendanceForAdmin = async (req: Request, res: Response) => {
  try {
    const { empId } = req.params;
    const { adminId, startDate, endDate, limit = 50, offset = 0 } = req.query;

    if (!empId || !adminId) {
      return res.status(400).json({ error: "Employee ID and Admin ID are required" });
    }

    // Verify admin user
    const admin = await prisma.user.findUnique({
      where: { id: adminId as string }
    });

    if (!admin || (admin.role !== 'ADMIN' && admin.role !== 'SUPER_ADMIN')) {
      return res.status(403).json({ error: "Unauthorized: Admin access required" });
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
        orderBy: { date: 'desc' },
        take: parseInt(limit as string),
        skip: parseInt(offset as string),
        include: {
          photos: true,
          audio: true,
          attendanceDate: true
        }
      }),
      prisma.attendance.count({ where: whereCondition }),
      prisma.user.findUnique({
        where: { empId },
        include: {
          userLocation: true,
          attendanceStatistics: true
        }
      })
    ]);

    // Log admin activity
    await prisma.adminActivity.create({
      data: {
        adminId: admin.id,
        adminEmpId: admin.empId,
        adminEmail: admin.email,
        action: 'VIEWED_ATTENDANCE',
        targetUserId: empId,
        details: {
          dateRange: { startDate, endDate },
          recordsViewed: attendances.length
        },
        ipAddress: req.ip || null,
        userAgent: req.get('user-agent') || null
      }
    });

    res.status(200).json({
      success: true,
      data: {
        user,
        attendances,
        pagination: {
          total,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string)
        }
      }
    });

  } catch (error: any) {
    console.error("Get user attendance for admin error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Helper function to calculate week of year
function getWeekOfYear(date: Date): number {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

// Helper function to update attendance statistics
async function updateAttendanceStatistics(tx: any, empId: string, attendanceDate: Date) {
  let stats = await tx.attendanceStatistics.findUnique({
    where: { empId }
  });

  const currentYear = attendanceDate.getFullYear();
  const currentMonth = attendanceDate.getMonth() + 1;
  const currentWeek = getWeekOfYear(attendanceDate);

  if (!stats) {
    // Create new statistics record
    stats = await tx.attendanceStatistics.create({
      data: {
        empId,
        totalDays: 1,
        currentStreak: 1,
        longestStreak: 1,
        firstAttendance: attendanceDate,
        lastAttendance: attendanceDate,
        monthlyCount: {
          [currentYear]: {
            [currentMonth]: 1
          }
        },
        thisMonthCount: 1,
        thisWeekCount: 1,
        weeklyAverage: 0
      }
    });
  } else {
    // Update existing statistics
    const lastDate = stats.lastAttendance ? new Date(stats.lastAttendance) : null;
    let currentStreak = stats.currentStreak;

    if (lastDate) {
      const daysDiff = Math.floor((attendanceDate.getTime() - lastDate.getTime()) / 86400000);
      
      if (daysDiff === 1) {
        // Consecutive day
        currentStreak++;
      } else if (daysDiff > 1) {
        // Streak broken
        currentStreak = 1;
      }
    }

    const longestStreak = Math.max(stats.longestStreak, currentStreak);

    // Update monthly count
    const monthlyCount = stats.monthlyCount as any || {};
    
    if (!monthlyCount[currentYear]) {
      monthlyCount[currentYear] = {};
    }
    monthlyCount[currentYear][currentMonth] = (monthlyCount[currentYear][currentMonth] || 0) + 1;

    // Calculate this month count
    const thisMonthCount = monthlyCount[currentYear][currentMonth];

    // Calculate this week count
    const startOfWeek = new Date(attendanceDate);
    startOfWeek.setDate(attendanceDate.getDate() - attendanceDate.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const thisWeekAttendance = await tx.attendanceDate.count({
      where: {
        empId: empId,
        date: {
          gte: startOfWeek,
          lte: attendanceDate
        }
      }
    });

    await tx.attendanceStatistics.update({
      where: { empId },
      data: {
        totalDays: stats.totalDays + 1,
        currentStreak,
        longestStreak,
        lastAttendance: attendanceDate,
        monthlyCount,
        thisMonthCount,
        thisWeekCount: thisWeekAttendance,
        weeklyAverage: calculateWeeklyAverage(stats.totalDays + 1, stats.firstAttendance || stats.createdAt || new Date())
      }
    });
  }
}

// Helper function to update attendance calendar mask
async function updateAttendanceCalendar(tx: any, empId: string, attendanceDate: Date) {
  const year = attendanceDate.getFullYear();
  const month = attendanceDate.getMonth() + 1;
  const day = attendanceDate.getDate();

  let calendar = await tx.attendanceCalendar.findUnique({
    where: {
      empId_year_month: {
        empId,
        year,
        month
      }
    }
  });

  if (!calendar) {
    // Create new calendar entry
    const daysMask = '0'.repeat(31);
    const newMask = daysMask.substring(0, day - 1) + '1' + daysMask.substring(day);
    
    await tx.attendanceCalendar.create({
      data: {
        empId,
        year,
        month,
        daysMask: newMask,
        totalDays: 1
      }
    });
  } else {
    // Update existing calendar entry
    const daysMask = calendar.daysMask.padEnd(31, '0');
    const newMask = daysMask.substring(0, day - 1) + '1' + daysMask.substring(day);
    const totalDays = newMask.split('1').length - 1;

    await tx.attendanceCalendar.update({
      where: {
        empId_year_month: {
          empId,
          year,
          month
        }
      },
      data: {
        daysMask: newMask,
        totalDays
      }
    });
  }
}

// Helper function to calculate weekly average
function calculateWeeklyAverage(totalDays: number, startDate: Date): number {
  const weeks = Math.max(1, Math.ceil((Date.now() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)));
  return totalDays / weeks;
}