import { Router } from 'express';
import { updateUserLocation, getUserLocation } from '../controllers/userLocation.controller.js';

const router = Router();

router.put('/user-location', updateUserLocation);
router.get('/user-location/:empId', getUserLocation);

export default router;