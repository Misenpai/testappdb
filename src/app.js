const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const attendanceRoutes = require('./routes/attendance');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (uploaded images/audio)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/api/attendance', attendanceRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false, 
    error: 'Something went wrong!' 
  });
});

module.exports = app;