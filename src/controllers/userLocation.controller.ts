// src/controllers/userLocation.controller.ts
import type { Request, Response } from "express";
import { PrismaClient, LocationType } from "../../generated/prisma/index.js";

const prisma = new PrismaClient();

// IIT Guwahati coordinates
const IIT_GUWAHATI = {
  lat: 26.1923, // decimal
  lng: 91.6951, // decimal
  radius: 2000 // meters
};

export const updateUserLocation = async (req: Request, res: Response) => {
  try {
    const { empId, locationType, fieldTripDates } = req.body;

    if (!empId || !locationType) {
      return res.status(400).json({
        success: false,
        error: "Employee ID and location type are required",
      });
    }

    if (!Object.values(LocationType).includes(locationType)) {
      return res.status(400).json({
        success: false,
        error: "Invalid location type. Must be ABSOLUTE, APPROX, or FIELDTRIP",
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const updateData: any = {
        locationType,
        approxLat: null,
        approxLng: null,
        approxRadius: null
      };

      if (locationType === "APPROX") {
        updateData.approxLat = IIT_GUWAHATI.lat;
        updateData.approxLng = IIT_GUWAHATI.lng;
        updateData.approxRadius = IIT_GUWAHATI.radius;
      }

      const userLocation = await tx.userLocation.update({
        where: { empId },
        data: updateData,
      });

      if (locationType === "FIELDTRIP" && fieldTripDates) {
        await tx.fieldTrip.updateMany({
          where: { empId, isActive: true },
          data: { isActive: false },
        });

        if (fieldTripDates.length > 0) {
          await tx.fieldTrip.createMany({
            data: fieldTripDates.map((trip: any) => ({
              empId,
              startDate: new Date(trip.startDate),
              endDate: new Date(trip.endDate),
              description: trip.description,
              createdBy: req.body.adminId || "system",
              isActive: true
            }))
          });
        }
      } else if (locationType !== "FIELDTRIP") {
        await tx.fieldTrip.updateMany({
          where: { empId },
          data: { isActive: false }
        });
      }

      return userLocation;
    });

    res.status(200).json({
      success: true,
      data: result,
      message: "User location updated successfully",
    });
  } catch (error: any) {
    console.error("Update user location error:", error);
    if (error.code === "P2025") {
      return res.status(404).json({
        success: false,
        error: "User location not found",
      });
    }
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const getUserLocationWithFieldTrips = async (req: Request, res: Response) => {
  try {
    const { empId } = req.params;

    if (!empId) {
      return res.status(400).json({
        success: false,
        error: "Employee ID is required",
      });
    }

    const userLocation = await prisma.userLocation.findUnique({
      where: { empId },
      include: {
        user: {
          select: {
            empId: true,
            username: true,
            email: true,
            location: true,
          },
        },
        fieldTrips: {
          where: { isActive: true },
          orderBy: { startDate: "asc" }
        }
      },
    });

    if (!userLocation) {
      return res.status(404).json({
        success: false,
        error: "User location not found",
      });
    }

    res.status(200).json({
      success: true,
      data: userLocation,
    });
  } catch (error: any) {
    console.error("Get user location error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// src/controllers/userLocation.controller.ts
export const getUserLocationByUsername = async (req: Request, res: Response) => {
  try {
    const { username } = req.params;

    if (!username) {
      return res.status(400).json({
        success: false,
        error: "Username is required",
      });
    }

    // First get the user to get empId
    const user = await prisma.user.findUnique({
      where: { username },
      select: { empId: true }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    const userLocation = await prisma.userLocation.findUnique({
      where: { empId: user.empId },
      include: {
        user: {
          select: {
            empId: true,
            username: true,
            email: true,
            location: true,
          },
        },
        fieldTrips: {
          where: {
            isActive: true,
            // Only get current and future field trips
            endDate: {
              gte: new Date()
            }
          },
          orderBy: { startDate: 'asc' }
        }
      },
    });

    if (!userLocation) {
      // Return default ABSOLUTE if no location record exists
      return res.status(200).json({
        success: true,
        data: {
          empId: user.empId,
          username,
          locationType: 'ABSOLUTE',
          fieldTrips: []
        },
      });
    }

    res.status(200).json({
      success: true,
      data: userLocation,
    });
  } catch (error: any) {
    console.error("Get user location by username error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const processFieldTripAttendance = async (req: Request, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activeFieldTrips = await prisma.fieldTrip.findMany({
      where: {
        isActive: true,
        startDate: { lte: today },
        endDate: { gte: today }
      },
      include: {
        userLocation: {
          include: {
            user: true
          }
        }
      }
    });

    const results = [];
    for (const trip of activeFieldTrips) {
      const existingAttendance = await prisma.attendance.findUnique({
        where: {
          empId_date: {
            empId: trip.empId,
            date: today
          }
        }
      });

      if (!existingAttendance) {
        const attendance = await prisma.attendance.create({
          data: {
            empId: trip.empId,
            username: trip.userLocation.user.username,
            takenLocation: "Field Trip",
            date: today,
            checkInTime: new Date(today.getTime() + 9.5 * 60 * 60 * 1000),
            checkOutTime: new Date(today.getTime() + 17.5 * 60 * 60 * 1000),
            sessionType: "FORENOON",
            attendanceType: "FULL_DAY",
            isCheckedOut: true,
          }
        });

        await prisma.attendanceDate.create({
          data: {
            empId: trip.empId,
            date: today,
            year: today.getFullYear(),
            month: today.getMonth() + 1,
            day: today.getDate(),
            dayOfWeek: today.getDay(),
            weekOfYear: getWeekOfYear(today),
            isPresent: true,
            attendanceType: "FULL_DAY",
            attendanceId: attendance.id
          }
        });

        results.push({
          empId: trip.empId,
          username: trip.userLocation.user.username,
          status: "marked"
        });
      }
    }

    res.status(200).json({
      success: true,
      message: `Field trip attendance processed for ${results.length} users`,
      data: results
    });
  } catch (error: any) {
    console.error("Process field trip attendance error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

function getWeekOfYear(date: Date): number {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}
