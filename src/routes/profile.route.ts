import { Router } from 'express';
import { 
  getUserProfile, 
  getUserProfileByUsername, 
  updateUserProfile,
  updateUserLocation
} from '../controllers/profile.controller.js';

const router = Router();


router.get('/profile/:empId', getUserProfile);


router.get('/profile/username/:username', getUserProfileByUsername);


router.put('/profile/:empId', updateUserProfile);

router.patch('/profile/:empId/location', updateUserLocation);

export default router;