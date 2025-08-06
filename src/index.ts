
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import attendanceRoutes from './routes/attendance.route.js';
import userRoutes from './routes/user.route.js'; // Add this

dotenv.config();
connectDB();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(process.env.UPLOAD_DIR || 'uploads'));

app.use('/api', attendanceRoutes);
app.use('/api', userRoutes); // Add this

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on :${PORT}`));