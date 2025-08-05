const express = require('express');
const router = express.Router();
const { 
  uploadAttendanceData, 
  getAttendanceHistory, 
  getAllAttendance 
} = require('../controllers/attendanceController');
const uploadMiddleware = require('../middleware/upload');

// Upload attendance data
router.post('/upload', uploadMiddleware, uploadAttendanceData);

// Get attendance history for specific user
router.get('/history/:userId', getAttendanceHistory);

// Get all attendance records (for admin)
router.get('/all', getAllAttendance);

module.exports = router;