// src/index.ts
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB } from './config/db.js';
import attendanceRoutes from './routes/attendance.route.js';
import userRoutes from './routes/user.route.js';
import userLocationRoutes from './routes/userLocation.route.js';
import profileRoutes from './routes/profile.route.js';

dotenv.config();
connectDB();

const app = express();

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());

const uploadsPath = path.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads');
app.use('/uploads', express.static(uploadsPath));

app.use(express.static(uploadsPath));

app.get('/api/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Backend server is running',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', uptime: process.uptime() });
});

app.use('/api', attendanceRoutes);
app.use('/api', userRoutes);
app.use('/api', userLocationRoutes);
app.use('/api', profileRoutes);

const PORT = parseInt(process.env.PORT || '3000', 10);

import os from 'os';

function getLocalIPv4() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

const localIP = getLocalIPv4();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log(`API available at http://${localIP}:${PORT}/api`);
  console.log(`Uploads served from: ${uploadsPath}`);
});