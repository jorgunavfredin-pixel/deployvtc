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
            store_name, support_username,
            order_prefix, support_hours, theme_preset,
            admin_panel_password,
            // PaKasir
            pakasir_api_key, pakasir_slug,
            // WijayaPay
            wijayapay_code_merchant, wijayapay_api_key,
            // Xoftware
            xoftware_api_key, xoftware_merchant_id, xoftware_webhook_secret,
            xoftware_notify_url, xoftware_fee_direction,
            // KlikQRIS
            klikqris_api_key, klikqris_merchant_id
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
        if (!bot_token || !admin_id || !store_name || !support_username) {
            return res.status(400).json({ success: false, error: 'Field wajib (bot token, admin id, nama toko, support username) harus diisi.' });
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

        // Build .env vars (sesuai .env.example bot vitaicmin)
        const envVars = {
            BOT_TOKEN: bot_token.trim(),
            ADMIN_ID: admin_id.trim(),
            PORT: '3000',
            WEBHOOK_URL: `http://${VPS_IP}:${port}`,
            TZ: 'Asia/Jakarta',
            STORE_NAME: (store_name || 'Store').trim(),
            SUPPORT_USERNAME: (support_username || '').trim(),
            ORDER_PREFIX: (order_prefix || 'ORD').trim(),
            SUPPORT_HOURS: (support_hours || '09:00 - 23:00 WIB').trim(),
            THEME_PRESET: (theme_preset || 'gold').toLowerCase(),
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
            KLIKQRIS_MERCHANT_ID: (klikqris_merchant_id || '').trim()
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

// ==================== RENEW / EXTEND LICENSE ====================

const axios = require('axios');

// Harga per bulan (Rp). Default 30.000, bisa di-set via env RENEW_PRICE_PER_MONTH.
const RENEW_PRICE_PER_MONTH = parseInt(process.env.RENEW_PRICE_PER_MONTH) || 30000;

// Harga per hari = harga per bulan / 30 (pembulatan ke bawah per hari)
const priceForDays = (days) => {
    const d = Math.max(1, Math.min(3650, parseInt(days) || 0));
    const perDay = Math.floor(RENEW_PRICE_PER_MONTH / 30);
    return { days: d, amount: perDay * d, perDay, pricePerMonth: RENEW_PRICE_PER_MONTH };
};

const klikqrisRenewCreate = async (orderId, amount, description) => {
    const apiKey = process.env.KLIKQRIS_API_KEY || '';
    const merchantId = process.env.KLIKQRIS_MERCHANT_ID || '';
    if (!apiKey || !merchantId) {
        return { success: false, error: 'KlikQRIS credential belum dikonfigurasi di .env panel deploy' };
    }
    try {
        const response = await axios.post('https://klikqris.com/api/qris/create', {
            order_id: orderId,
            id_merchant: merchantId,
            amount: Math.round(amount),
            keterangan: description || `Perpanjangan Lisensi ${orderId}`
        }, {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'id_merchant': merchantId
            },
            timeout: 30000
        });
        const body = response.data || {};
        const data = body.data || body;
        if (body.status !== true && !data.qris_url) {
            return { success: false, error: body.message || body.error || 'Gagal membuat transaksi KlikQRIS' };
        }
        return { success: true, data };
    } catch (error) {
        return { success: false, error: error.response?.data?.message || error.message };
    }
};

const klikqrisRenewStatus = async (orderId) => {
    const apiKey = process.env.KLIKQRIS_API_KEY || '';
    const merchantId = process.env.KLIKQRIS_MERCHANT_ID || '';
    if (!apiKey || !merchantId) return { success: false, error: 'KlikQRIS credential belum dikonfigurasi' };
    try {
        const response = await axios.get(`https://klikqris.com/api/qris/status/${encodeURIComponent(orderId)}`, {
            headers: { 'x-api-key': apiKey, 'id_merchant': merchantId },
            timeout: 10000
        });
        const body = response.data || {};
        const data = body.data || body;
        const raw = String(data.status || '').toUpperCase();
        const status = (raw === 'SUCCESS' || raw === 'PAID') ? 'completed'
            : (raw === 'EXPIRED' || raw === 'CANCEL') ? 'expired' : 'pending';
        return { success: true, status, data };
    } catch (error) {
        return { success: false, error: error.response?.data?.message || error.message };
    }
};

/**
 * GET /api/renew/check?key=LICENSE
 * Cek status license: valid, tier, sisa hari, harga per bulan.
 */
router.get('/api/renew/check', (req, res) => {
    const key = String(req.query.key || '').trim().toUpperCase();
    if (!key) return res.status(400).json({ success: false, error: 'License key wajib diisi' });

    const lic = db.getLicenseByKey(key);
    if (!lic) return res.json({ success: false, reason: 'License key not found' });

    const dep = db.getDeploymentByLicense(key);
    const daysLeft = dep?.expires_at
        ? Math.max(0, Math.ceil((new Date(dep.expires_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
        : 0;
    const renewals = db.getRenewalsByLicense(key);

    res.json({
        success: true,
        license: {
            key,
            buyer_name: lic.buyer_name,
            tier: lic.tier || 'full',
            status: lic.status,
            store_name: dep?.store_name || null,
            port: dep?.port || null,
            expires_at: dep?.expires_at || null,
            days_left: daysLeft,
            running: dep ? true : false
        },
        pricing: { price_per_month: RENEW_PRICE_PER_MONTH, price_per_day: Math.floor(RENEW_PRICE_PER_MONTH / 30) },
        renewals
    });
});

/**
 * POST /api/renew/create { key, days }
 * Buat transaksi KlikQRIS untuk perpanjangan. Return signature utk Snap modal.
 */
router.post('/api/renew/create', async (req, res) => {
    try {
        const key = String(req.body.key || '').trim().toUpperCase();
        const days = parseInt(req.body.days);
        if (!key) return res.status(400).json({ success: false, error: 'License key wajib diisi' });
        if (!days || days < 1 || days > 3650) return res.status(400).json({ success: false, error: 'Durasi harus 1-3650 hari' });

        const lic = db.getLicenseByKey(key);
        if (!lic) return res.status(404).json({ success: false, error: 'License key not found' });
        if (lic.status === 'revoked') return res.status(400).json({ success: false, error: 'License telah di-revoke' });

        const { amount } = priceForDays(days);
        const orderId = `REN-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
        const created = db.createRenewal(key, orderId, amount, days);

        const result = await klikqrisRenewCreate(orderId, amount, `Perpanjangan Lisensi (${days} hari)`);
        if (!result.success) {
            return res.status(502).json({ success: false, error: result.error });
        }
        res.json({
            success: true,
            order_id: orderId,
            amount,
            days,
            signature: result.data.signature || null,
            qris_url: result.data.qris_url || null,
            qris_image: result.data.qris_image || null,
            created_at: created.created_at
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/renew/confirm { order_id }
 * Buyer klik "Cek Status": query KlikQRIS, kalau PAID → extend expiry + mark paid.
 */
router.post('/api/renew/confirm', async (req, res) => {
    try {
        const orderId = String(req.body.order_id || '').trim();
        if (!orderId) return res.status(400).json({ success: false, error: 'order_id wajib diisi' });

        const renewal = db.getRenewalByOrderId(orderId);
        if (!renewal) return res.status(404).json({ success: false, error: 'Transaksi tidak ditemukan' });

        if (renewal.status === 'paid') {
            return res.json({ success: true, already_paid: true, renewal });
        }

        const statusResult = await klikqrisRenewStatus(orderId);
        if (!statusResult.success) {
            return res.status(502).json({ success: false, error: statusResult.error });
        }

        if (statusResult.status === 'completed') {
            const dep = db.getDeploymentByLicense(renewal.license_key);
            const extended = dep ? db.extendDeploymentExpiry(dep.container_name, renewal.duration_days) : null;
            const paid = db.markRenewalPaid(orderId, new Date().toISOString());
            return res.json({
                success: true,
                paid: true,
                extended,
                renewal: paid
            });
        }

        if (statusResult.status === 'expired') {
            return res.json({ success: true, paid: false, status: 'expired', message: 'Transaksi kadaluarsa. Silakan buat ulang.' });
        }

        res.json({ success: true, paid: false, status: 'pending', message: 'Pembayaran belum terdeteksi. Silakan cek lagi nanti.' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
