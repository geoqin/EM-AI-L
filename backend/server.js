require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const { initDb } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
}));
app.use(express.json());
app.use(cookieParser(process.env.SESSION_SECRET));
app.use(require('./middleware/credits').identifyUser);

// Routes
app.use('/auth', require('./routes/auth'));
app.use('/api/emails', require('./routes/emails'));
app.use('/api/threads', require('./routes/threads'));
app.use('/api/chat', require('./routes/chat'));

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Initialize database then start server
(async () => {
    try {
        await initDb();
        app.listen(PORT, () => {
            console.log(`\n🚀 EMail-AI-Laundry backend running on http://localhost:${PORT}`);
            console.log(`   Auth:   http://localhost:${PORT}/auth/google`);
            console.log(`   Health: http://localhost:${PORT}/health\n`);
        });
    } catch (err) {
        console.error('❌ Failed to initialize database:', err.message);
        process.exit(1);
    }
})();
