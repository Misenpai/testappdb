
import { Router } from 'express';
import { createAttendance, getAttendance } from '../controllers/attendance.controller.js';
import { upload } from '../utils/fileUpload.js';

const router = Router();

router.post(
  '/attendance',
  upload.any(),
  createAttendance
);

router.get('/attendance/:userId', getAttendance);

export default router;