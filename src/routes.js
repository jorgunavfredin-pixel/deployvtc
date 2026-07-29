const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const db = require('./db');
const dockerEngine = require('./docker');

const router = express.Router();

// Multer config for banner upload (max 2MB, PNG only)
const upload = multer({
    dest: path.join(__dirname, '../uploads/'),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'image/png') cb(null, true);
        else cb(new Error('Only PNG files allowed'));
    }
});

const VPS_IP = process.env.VPS_IP || 'localhost';
const MAX_DEPLOYMENTS = parseInt(process.env.MAX_CONTAINERS) || 8;

// ==================== RATE LIMITING ====================
const validateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { valid: false, reason: 'Terlalu banyak request. Coba lagi dalam 1 menit.' }
});

const deployLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 3,
    message: { success: false, error: 'Terlalu banyak request. Coba lagi dalam 1 menit.' }
});

// ==================== API ROUTES ====================

/**
 * GET /api/config
 */
router.get('/api/config', (req, res) => {
    res.json({
        telegramLink: process.env.TELEGRAM_LINK || 'https://t.me/yuriot'
    });
});

/**
 * POST /api/validate-license
 */
router.post('/api/validate-license', validateLimiter, (req, res) => {
    const { key } = req.body;
    if (!key) return res.status(400).json({ valid: false, reason: 'License key required' });

    const result = db.validateLicense(key.trim().toUpperCase());
    if (result.valid && result.license) {
        res.json({ valid: true, buyer_name: result.license.buyer_name });
    } else {
        res.json(result);
    }
});

/**
 * POST /api/validate-token
 * Validate Telegram bot token via getMe API
 */
router.post('/api/validate-token', validateLimiter, async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ valid: false, reason: 'Token required' });

    try {
        const response = await fetch(`https://api.telegram.org/bot${token.trim()}/getMe`);
        const data = await response.json();
        if (data.ok) {
            res.json({ valid: true, bot: data.result });
        } else {
            res.json({ valid: false, reason: 'Token tidak valid. Cek ulang di @BotFather.' });
        }
    } catch (error) {
        res.json({ valid: false, reason: 'Gagal validasi token. Coba lagi.' });
    }
});

/**
 * POST /api/deploy
 */
router.post('/api/deploy', deployLimiter, upload.single('banner'), async (req, res) => {
    try {
        const {
            license_key, bot_token, admin_id,
            pakasir_api_key, pakasir_slug,
            store_name, support_username,
            order_prefix, support_hours, theme_preset
        } = req.body;

        // Validate license
        const licenseCheck = db.validateLicense(license_key.trim().toUpperCase());
        if (!licenseCheck.valid) {
            return res.status(400).json({ success: false, error: licenseCheck.reason });
        }

        // Check max deployments
        const runningCount = db.getRunningCount();
        if (runningCount >= MAX_DEPLOYMENTS) {
            return res.status(400).json({ success: false, error: 'Server penuh. Hubungi admin.' });
        }

        // Validate required fields
        if (!bot_token || !admin_id || !store_name || !pakasir_api_key || !pakasir_slug || !support_username) {
            return res.status(400).json({ success: false, error: 'Semua field wajib harus diisi.' });
        }

        // Generate random port
        const port = db.generateRandomPort();
        const buyerName = licenseCheck.license.buyer_name || 'buyer';

        // Build .env vars
        const envVars = {
            BOT_TOKEN: bot_token.trim(),
            ADMIN_ID: admin_id.trim(),
            PORT: '3000',
            WEBHOOK_URL: `http://${VPS_IP}:${port}`,
            PAKASIR_API_KEY: (pakasir_api_key || '').trim(),
            PAKASIR_SLUG: (pakasir_slug || '').trim(),
            TZ: 'Asia/Jakarta',
            STORE_NAME: (store_name || 'Store').trim(),
            SUPPORT_USERNAME: (support_username || '').trim(),
            ORDER_PREFIX: (order_prefix || 'ORD').trim(),
            SUPPORT_HOURS: (support_hours || '09:00 - 23:00 WIB').trim(),
            THEME_PRESET: (theme_preset || 'gold').toLowerCase()
        };

        // Deploy container
        const result = await dockerEngine.deployBot({
            licenseKey: license_key.trim().toUpperCase(),
            port,
            envVars,
            bannerPath: req.file ? req.file.path : null,
            buyerName
        });

        if (!result.success) {
            return res.status(500).json({ success: false, error: result.error });
        }

        // Mark license as used
        db.markLicenseUsed(license_key.trim().toUpperCase());

        // Save deployment record
        db.createDeployment({
            license_id: licenseCheck.license.id,
            license_key: license_key.trim().toUpperCase(),
            buyer_name: buyerName,
            container_name: result.containerName,
            port,
            store_name: store_name.trim(),
            bot_token: bot_token.trim().slice(0, 10) + '...'
        });

        // Cleanup uploaded banner temp file
        if (req.file) {
            try { fs.unlinkSync(req.file.path); } catch (e) { }
        }

        res.json({
            success: true,
            message: 'Bot berhasil di-deploy! 🎉',
            webhookUrl: result.webhookUrl,
            port: result.port,
            containerName: result.containerName,
            pakasirSlug: (pakasir_slug || '').trim(),
            instructions: [
                `1. Buka PaKasir → Settings → Callback URL`,
                `2. Paste webhook URL: ${result.webhookUrl}`,
                `3. Bot kamu sudah aktif! Coba chat di Telegram`
            ]
        });

    } catch (error) {
        if (req.file) {
            try { fs.unlinkSync(req.file.path); } catch (e) { }
        }
        console.error('[DEPLOY] Error:', error);
        res.status(500).json({ success: false, error: 'Deployment gagal: ' + error.message });
    }
});

/**
 * GET /api/deploy-logs/:key
 * SSE stream of container logs after deploy
 */
router.get('/api/deploy-logs/:key', async (req, res) => {
    const deployment = db.getDeploymentByLicense(req.params.key.toUpperCase());
    if (!deployment) {
        return res.status(404).json({ error: 'Deployment not found' });
    }

    // SSE headers
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    let attempts = 0;
    const maxAttempts = 20; // 20 x 3s = 60s max

    const sendLogs = async () => {
        attempts++;
        try {
            const logs = await dockerEngine.getLogs(deployment.container_name, 15);
            res.write(`data: ${JSON.stringify({ type: 'log', content: logs })}\n\n`);

            const status = await dockerEngine.getStatus(deployment.container_name);
            if (status.running) {
                res.write(`data: ${JSON.stringify({ type: 'status', running: true })}\n\n`);
            }

            if (attempts >= maxAttempts || status.running) {
                res.write(`data: ${JSON.stringify({ type: 'done', running: status.running })}\n\n`);
                res.end();
                return;
            }
        } catch (e) {
            res.write(`data: ${JSON.stringify({ type: 'log', content: 'Waiting for container...' })}\n\n`);
        }

        if (attempts < maxAttempts) {
            setTimeout(sendLogs, 3000);
        }
    };

    // Start after 5s delay to let container boot
    setTimeout(sendLogs, 5000);

    req.on('close', () => { attempts = maxAttempts; });
});

/**
 * GET /api/status/:key
 */
router.get('/api/status/:key', async (req, res) => {
    const deployment = db.getDeploymentByLicense(req.params.key.toUpperCase());
    if (!deployment) {
        return res.status(404).json({ found: false });
    }

    const containerStatus = await dockerEngine.getStatus(deployment.container_name);
    res.json({
        found: true,
        store_name: deployment.store_name,
        port: deployment.port,
        status: containerStatus.status,
        running: containerStatus.running,
        uptime: containerStatus.uptime,
        webhookUrl: `http://${VPS_IP}:${deployment.port}/webhook/qris`,
        created_at: deployment.created_at,
        expires_at: deployment.expires_at
    });
});

module.exports = router;
