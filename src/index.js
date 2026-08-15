require('dotenv').config();
const express = require('express');
const path = require('path');
const routes = require('./routes');
const { adminPath, adminPassword, jwtSecret } = require('./secret');
const { startExpiryCron, startAutoBackupCron } = require('./cron');
const { startRenewalPolling, stopRenewalPolling } = require('./services/renewPayment');
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

// Fake 404 untuk /admin — orang yang nebak gak akan tau ada panel.
// Panel asli hanya di /admin-<random> (path rahasia dari secret.js).
app.get('/admin', (req, res) => {
    res.status(404).send('<h1>404 Not Found</h1>');
});

// SPA catch-all — must be AFTER api routes (termasuk /admin-*)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

// Start server
const server = app.listen(PORT, () => {
    console.log(`🌐 Web panel running on port ${PORT}`);
    console.log(`   Landing: http://localhost:${PORT}`);
    console.log(`   Deploy:  http://localhost:${PORT}/deploy`);
    console.log(`   Admin:   http://localhost:${PORT}/${adminPath}  <-- RAHASIA, jangan disebar`);
    // Password auto-generate: hanya ditampilkan kalau tidak di-set via env.
    if (!process.env.ADMIN_PANEL_PASSWORD) {
        console.log(`   Admin password (auto): ${adminPassword}`);
        console.log('   Set ADMIN_PANEL_PASSWORD di .env untuk pakai password sendiri.');
    }
});

// Start license bot — TIDAK AKTIF: semua admin control pindah ke web panel.
// Kalau mau re-enable, uncomment require di atas + panggil startBot() di sini.
// startBot();

// Start crons (expiry check + auto backup) — jalan tanpa bot Telegram.
startExpiryCron();
startAutoBackupCron();
startRenewalPolling();
console.log('⏰ Crons started (expiry check + auto backup + renewal polling)');

// Graceful shutdown
const shutdown = (signal) => {
    console.log(`\n⏹ ${signal} received, shutting down...`);
    stopRenewalPolling();
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
};

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
