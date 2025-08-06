// src/index.ts
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import attendanceRoutes from './routes/attendance.route.js';
import userRoutes from './routes/user.route.js';

dotenv.config();
connectDB();

const app = express();

// Enable CORS for all origins (for development)
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());
app.use(express.static(process.env.UPLOAD_DIR || 'uploads'));

// Add a test route for connection testing
app.get('/api/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Backend server is running',
    timestamp: new Date().toISOString()
  });
});

// Health check route
app.get('/health', (req, res) => {
  res.json({ status: 'OK', uptime: process.uptime() });
});

app.use('/api', attendanceRoutes);
app.use('/api', userRoutes);

const PORT = parseInt(process.env.PORT || '3000', 10);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log(`API available at http://10.150.11.131:${PORT}/api`);
});