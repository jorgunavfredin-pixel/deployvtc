const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const dockerEngine = require('../docker');

const router = express.Router();

// Multer config for banner upload (max 5MB, semua format gambar)
const upload = multer({
    dest: path.join(__dirname, '../../uploads/'),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype && file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only image files allowed'));
    }
});

const VPS_IP = process.env.VPS_IP || 'localhost';
const MAX_DEPLOYMENTS = parseInt(process.env.MAX_CONTAINERS) || 8;

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

/**
 * POST /api/validate-license
 */
router.post('/api/validate-license', validateLimiter, (req, res) => {
    const { key } = req.body;
    if (!key) return res.status(400).json({ valid: false, reason: 'License key required' });

    const result = db.validateLicense(key.trim().toUpperCase());
    if (result.valid && result.license) {
        res.json({ valid: true, buyer_name: result.license.buyer_name, tier: result.license.tier || 'full' });
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
            store_name,
            order_prefix, theme_preset,
            admin_panel_password, rent_bot_enabled,
            support_telegram_url, support_whatsapp_url, support_channel_url, support_group_url,
            // PaKasir
            pakasir_api_key, pakasir_slug,
            // WijayaPay
            wijayapay_code_merchant, wijayapay_api_key,
            // Xoftware
            xoftware_api_key, xoftware_merchant_id, xoftware_webhook_secret,
            xoftware_notify_url, xoftware_fee_direction,
            // KlikQRIS
            klikqris_api_key, klikqris_merchant_id,
            // Binance Pay
            binance_api_key, binance_api_secret, binance_qr_string, binance_currency
        } = req.body;

        // Validate license
        const licenseCheck = db.validateLicense(license_key.trim().toUpperCase());
        if (!licenseCheck.valid) {
            return res.status(400).json({ success: false, error: licenseCheck.reason });
        }
        const tier = licenseCheck.license.tier || 'full';

        // Check max deployments
        const runningCount = db.getRunningCount();
        if (runningCount >= MAX_DEPLOYMENTS) {
            return res.status(400).json({ success: false, error: 'Server penuh. Hubungi admin.' });
        }

        // Validate required fields
        if (!bot_token || !admin_id || !store_name) {
            return res.status(400).json({ success: false, error: 'Field wajib (bot token, admin id, nama toko) harus diisi.' });
        }
        // Minimal 1 support URL wajib
        if (!support_telegram_url && !support_whatsapp_url && !support_channel_url && !support_group_url) {
            return res.status(400).json({ success: false, error: 'Minimal 1 Support URL wajib diisi (Telegram/WhatsApp/Channel/Group).' });
        }
        // Admin Panel Password hanya wajib untuk tier 'full'
        if (tier === 'full' && !admin_panel_password) {
            return res.status(400).json({ success: false, error: 'License tier FULL memerlukan Admin Panel Password.' });
        }

        // Minimal satu payment gateway QRIS wajib terisi
        const hasPaKasir = !!(pakasir_api_key && pakasir_slug);
        const hasWijayaPay = !!(wijayapay_code_merchant && wijayapay_api_key);
        const hasXoftware = !!(xoftware_api_key && xoftware_merchant_id && xoftware_webhook_secret);
        const hasKlikQRIS = !!(klikqris_api_key && klikqris_merchant_id);
        if (!hasPaKasir && !hasWijayaPay && !hasXoftware && !hasKlikQRIS) {
            return res.status(400).json({ success: false, error: 'Minimal satu payment gateway QRIS harus diisi (PaKasir / WijayaPay / Xoftware / KlikQRIS).' });
        }

        // Generate random port
        const port = db.generateRandomPort();
        const buyerName = licenseCheck.license.buyer_name || 'buyer';
        const rentBotEnabled = String(rent_bot_enabled || '').toLowerCase() === 'true';

        // Build .env vars (sesuai .env.example bot vitaicmin)
        const envVars = {
            BOT_TOKEN: bot_token.trim(),
            ADMIN_ID: admin_id.trim(),
            PORT: '3000',
            WEBHOOK_URL: `http://${VPS_IP}:${port}`,
            TZ: 'Asia/Jakarta',
            STORE_NAME: (store_name || 'Store').trim(),
            ORDER_PREFIX: (order_prefix || 'ORD').trim(),
            SUPPORT_TELEGRAM_URL: (support_telegram_url || '').trim(),
            SUPPORT_WHATSAPP_URL: (support_whatsapp_url || '').trim(),
            SUPPORT_CHANNEL_URL: (support_channel_url || '').trim(),
            SUPPORT_GROUP_URL: (support_group_url || '').trim(),
            THEME_PRESET: (theme_preset || 'gold').toLowerCase(),
            RENT_BOT_ENABLED: rentBotEnabled ? 'true' : 'false',
            // Admin panel: hanya di-set untuk tier 'full'. Tier 'chat' tanpa
            // password → panel /admin nonaktif (backend bot mewajibkan password).
            ...(tier === 'full' && admin_panel_password
                ? { ADMIN_PANEL_PASSWORD: admin_panel_password.trim() }
                : {}),
            // PaKasir
            PAKASIR_API_KEY: (pakasir_api_key || '').trim(),
            PAKASIR_SLUG: (pakasir_slug || '').trim(),
            // WijayaPay
            WIJAYAPAY_CODE_MERCHANT: (wijayapay_code_merchant || '').trim(),
            WIJAYAPAY_API_KEY: (wijayapay_api_key || '').trim(),
            // Xoftware
            XOWFTWARE_API_KEY: (xoftware_api_key || '').trim(),
            XOWFTWARE_MERCHANT_ID: (xoftware_merchant_id || '').trim(),
            XOWFTWARE_WEBHOOK_SECRET: (xoftware_webhook_secret || '').trim(),
            XOWFTWARE_NOTIFY_URL: (xoftware_notify_url || '').trim(),
            XOWFTWARE_FEE_DIRECTION: (xoftware_fee_direction === 'user' ? 'user' : 'merchant'),
            // KlikQRIS
            KLIKQRIS_API_KEY: (klikqris_api_key || '').trim(),
            KLIKQRIS_MERCHANT_ID: (klikqris_merchant_id || '').trim(),
            // Binance Pay
            BINANCE_API_KEY: (binance_api_key || '').trim(),
            BINANCE_API_SECRET: (binance_api_secret || '').trim(),
            BINANCE_QR_STRING: (binance_qr_string || '').trim(),
            BINANCE_CURRENCY: (binance_currency || 'USDT').trim()
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
        const deployment = db.createDeployment({
            license_id: licenseCheck.license.id,
            license_key: license_key.trim().toUpperCase(),
            buyer_name: buyerName,
            container_name: result.containerName,
            port,
            store_name: store_name.trim(),
            bot_token: bot_token.trim().slice(0, 10) + '...',
            initial_days: licenseCheck.license.initial_days,
            rent_bot_enabled: rentBotEnabled
        });

        // Cleanup uploaded banner temp file
        if (req.file) {
            try { fs.unlinkSync(req.file.path); } catch (e) { }
        }

        const baseWebhook = `http://${VPS_IP}:${port}`;
        const webhooks = [];
        if (hasPaKasir) webhooks.push({ provider: 'PaKasir', url: `${baseWebhook}/webhook/qris` });
        if (hasWijayaPay) webhooks.push({ provider: 'WijayaPay', url: `${baseWebhook}/webhook/wijayapay` });
        if (hasXoftware) webhooks.push({ provider: 'Xoftware', url: `${baseWebhook}/webhook/xoftware` });
        if (hasKlikQRIS) webhooks.push({ provider: 'KlikQRIS', url: `${baseWebhook}/webhook/klikqris` });

        res.json({
            success: true,
            message: 'Bot berhasil di-deploy! 🎉',
            webhookUrl: webhooks[0]?.url || `${baseWebhook}/webhook/qris`,
            webhooks,
            port: result.port,
            containerName: result.containerName,
            pakasirSlug: (pakasir_slug || '').trim(),
            adminUrl: `${baseWebhook}/admin`,
            rentBotEnabled,
            baseDays: deployment.base_days,
            bonusDays: deployment.bonus_days,
            totalDays: deployment.total_days,
            expiresAt: deployment.expires_at,
            instructions: [
                `1. Buka panel admin: ${baseWebhook}/admin (password: yang kamu isi)`,
                ...webhooks.map(w => `2. Set callback ${w.provider}: ${w.url}`),
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
