
import multer from 'multer';
import path from 'path';
import { ensureDir } from './folderUtils.js';

const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const { userId, ts } = _req.body;
    const dest = path.join(UPLOAD_DIR, userId, ts);
    ensureDir(dest);
    cb(null, dest);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const isAudio = /audio/.test(file.mimetype);
    const name = isAudio ? 'audio_rec.m4a' : `photo_${Date.now()}${ext}`;
    cb(null, name);
  }
});

export const upload = multer({ storage });