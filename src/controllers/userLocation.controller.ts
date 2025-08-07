import type { Request, Response } from 'express';
import { PrismaClient, LocationType } from '../../generated/prisma/index.js';

const prisma = new PrismaClient();

export const updateUserLocation = async (req: Request, res: Response) => {
  try {
    const { empId, locationType } = req.body;

    if (!empId || !locationType) {
      return res.status(400).json({
        success: false,
        error: "Employee ID and location type are required"
      });
    }

    if (!Object.values(LocationType).includes(locationType)) {
      return res.status(400).json({
        success: false,
        error: "Invalid location type. Must be ABSOLUTE, APPROX, or FIELDTRIP"
      });
    }

    const userLocation = await prisma.userLocation.update({
      where: { empId },
      data: { location: locationType }
    });

    res.status(200).json({
      success: true,
      data: userLocation,
      message: "User location updated successfully"
    });

  } catch (error: any) {
    console.error("Update user location error:", error);
    
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        error: "User location not found"
      });
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

export const getUserLocation = async (req: Request, res: Response) => {
  try {
    const { empId } = req.params;

    const userLocation = await prisma.userLocation.findUnique({
      where: { empId },
      include: {
        user: {
          select: {
            empId: true,
            username: true,
            email: true,
            location: true
          }
        }
      }
    });

    if (!userLocation) {
      return res.status(404).json({
        success: false,
        error: "User location not found"
      });
    }

    res.status(200).json({
      success: true,
      data: userLocation
    });

  } catch (error: any) {
    console.error("Get user location error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};