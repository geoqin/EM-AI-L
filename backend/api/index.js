// Vercel serverless entry point — wraps the Express app
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { initDb } = require('../db/database');

const app = express();

// Trust Vercel's proxy (required for secure cookies)
app.set('trust proxy', 1);

// Initialize DB on cold start (before any route handling)
let dbReady = false;
app.use(async (req, res, next) => {
    if (!dbReady) {
        await initDb();
        dbReady = true;
    }
    next();
});

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
}));
app.use(express.json());
app.use(cookieParser(process.env.SESSION_SECRET));
app.use(require('../middleware/credits').identifyUser);

// Routes
app.use('/auth', require('../routes/auth'));
app.use('/api/emails', require('../routes/emails'));
app.use('/api/threads', require('../routes/threads'));
app.use('/api/chat', require('../routes/chat'));

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = app;
