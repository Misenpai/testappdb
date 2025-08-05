const upload = require('../config/multer');

const uploadMiddleware = upload.fields([
  { name: 'photos', maxCount: 10 },
  { name: 'audio', maxCount: 1 }
]);

module.exports = uploadMiddleware;