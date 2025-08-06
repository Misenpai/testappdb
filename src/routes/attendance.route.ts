
import { Router } from 'express';
import { createAttendance } from '../controllers/attendance.controller.js';
import { upload } from '../utils/fileUpload.js';

const router = Router();

router.post(
  '/attendance',
  upload.any(),
  createAttendance
);


export default router;