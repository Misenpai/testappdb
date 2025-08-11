// src/routes/attendance.route.ts
import { Router } from 'express';
import { 
  createAttendance, 
  getAttendanceCalendar,
  getUserAttendanceSummary,
  getAllUsersWithAttendance,
  getUserAttendanceDetails
} from '../controllers/attendance.controller.js';
import { upload } from '../utils/fileUpload.js';

const router = Router();

// User routes
router.post(
  '/attendance',
  upload.any(),
  createAttendance
);

// Get attendance calendar data for a user (for mobile app profile)
router.get('/attendance/calendar/:empId', getAttendanceCalendar);

// Get user attendance summary for profile
router.get('/attendance/summary/:empId', getUserAttendanceSummary);

// Admin routes (No authentication required - for admin dashboard)
router.get('/admin/users-attendance', getAllUsersWithAttendance);
router.get('/admin/users/:empId/attendance', getUserAttendanceDetails);

export default router;