const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');


const ensureUploadDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userId = req.body.userId || 'unknown';
    const timestamp = Date.now();
    const uploadPath = path.join(process.env.UPLOAD_PATH || './uploads', 'attendance', userId, timestamp.toString());
    
    ensureUploadDir(uploadPath);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const fieldname = file.fieldname;
    
    if (fieldname === 'photos') {
      const photoIndex = req.photoCounter || 1;
      req.photoCounter = photoIndex + 1;
      cb(null, `photo_${photoIndex}${ext}`);
    } else if (fieldname === 'audio') {
      cb(null, `audio_rec${ext}`);
    } else {
      const timestamp = Date.now();
      cb(null, `${timestamp}_${file.originalname}`);
    }
  }
});

const fileFilter = (req, file, cb) => {
  if (file.fieldname === 'photos') {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed for photos'), false);
    }
  } else if (file.fieldname === 'audio') {
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'), false);
    }
  } else {
    cb(new Error('Unexpected field'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
  },
  fileFilter: fileFilter
});

module.exports = upload;