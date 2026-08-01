require('dotenv').config();
const express = require('express');
const path = require('path');
const routes = require('./routes');
const { startBot, stopBot } = require('./bot');
const app = express();
const PORT = process.env.PORT || 800;

// Enable trust proxy for rate limiting behind reverse proxies (Nginx/Cloudflare)
app.set('trust proxy', 1);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files — serve React build
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// API routes
app.use(routes);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', uptime: process.uptime() });
});

// SPA catch-all — must be AFTER api routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

// Start server
const server = app.listen(PORT, () => {
    console.log(`🌐 Web panel running on port ${PORT}`);
    console.log(`   Landing: http://localhost:${PORT}`);
    console.log(`   Deploy:  http://localhost:${PORT}/deploy`);
});

// Start license bot
startBot();

// Graceful shutdown
const shutdown = (signal) => {
    console.log(`\n⏹ ${signal} received, shutting down...`);
    stopBot();
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
};

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
