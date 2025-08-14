// src/routes/userLocation.route.ts
import { Router } from 'express';
import {
  updateUserLocation,
  getUserLocationWithFieldTrips,
  processFieldTripAttendance,
  getUserLocationByUsername
} from '../controllers/userLocation.controller.js';

const router = Router();

router.put('/user-location', updateUserLocation);
router.get('/user-location/:empId', getUserLocationWithFieldTrips);
router.get('/user-location/:empId/field-trips', getUserLocationWithFieldTrips);
router.post('/field-trips/process-attendance', processFieldTripAttendance);
// src/routes/userLocation.route.ts
router.get('/user-location/username/:username', getUserLocationByUsername);

export default router;
