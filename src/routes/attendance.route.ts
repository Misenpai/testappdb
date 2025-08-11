import { Router } from 'express';
import { 
  createAttendance, 
  getAttendanceCalendar,
  getUserAttendanceSummary,  // New function for profile summary
  updateUserLocationType,
  getAllUsersWithLocations,
  getUserAttendanceForAdmin  // New function for admin to view user attendance
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

// Admin routes
router.put('/admin/user-location-type/:empId', updateUserLocationType);
router.get('/admin/users-locations', getAllUsersWithLocations);
router.get('/admin/users/:empId/attendance', getUserAttendanceForAdmin);

export default router;