import { Router } from 'express';
import { createAttendance } from '../controllers/attendance.controller.js';
import { upload } from '../utils/fileUpload.js';

const router = Router();

router.post(
  '/attendance',
  upload.any(),          // accepts any number of photos + 1 optional audio
  createAttendance
);

export default router;