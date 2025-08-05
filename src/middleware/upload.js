import upload from '../config/multer.js';

const uploadMiddleware = upload.fields([
  { name: 'photos', maxCount: 10 },
  { name: 'audio', maxCount: 1 }
]);

export default uploadMiddleware;