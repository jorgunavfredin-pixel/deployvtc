const express = require('express');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('../db');
const dockerEngine = require('../docker');

const router = express.Router();

// Multer untuk upload banner (max 5MB)
const upload = multer({
    dest: path.join(__dirname, '../../uploads/'),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype && file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only image files allowed'));
    }
});

// ==================== AUTH CONFIG ====================

const { jwtSecret, adminPassword } = require('../secret');
const JWT_SECRET = jwtSecret;
const JWT_EXPIRY = '8h';
const COOKIE_NAME = 'deploy_admin_token';

// Password admin: dari secret.js (env ADMIN_PANEL_PASSWORD > file > auto-generate).
const ADMIN_PASSWORD = adminPassword;

// ==================== AUDIT LOG ====================

// Audit log sederhana (in-memory, max 200 entri).
const auditLog = [];
const MAX_AUDIT = 200;

const logAudit = (action, detail = '', actor = 'admin') => {
    auditLog.unshift({
        id: Date.now() + Math.random().toString(36).slice(2, 6),
        action,
        detail,
        actor,
        at: new Date().toISOString()
    });
    if (auditLog.length > MAX_AUDIT) auditLog.length = MAX_AUDIT;
};

// ==================== MIDDLEWARE ====================

// Rate limit login (anti brute-force): 5 percobaan per 15 menit per IP
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.' }
});

// Rate limit umum untuk API admin (anti spam)
const adminLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Terlalu banyak request. Coba lagi nanti.' }
});

// Parse cookies
router.use(cookieParser());

// Auth middleware: verifikasi JWT dari httpOnly cookie
const requireAuth = (req, res, next) => {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) return res.status(401).json({ success: false, error: 'Tidak terautentikasi' });

    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.admin = payload;
        next();
    } catch (e) {
        return res.status(401).json({ success: false, error: 'Sesi tidak valid atau kadaluarsa' });
    }
};

// Security headers hanya untuk route admin
router.use((req, res, next) => {
    if (!req.path.startsWith('/api/admin')) return next();
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    next();
});

// ==================== AUTH ENDPOINTS ====================

/**
 * POST /api/admin/login { password }
 * Verifikasi password → set JWT di httpOnly cookie.
 */
router.post('/api/admin/login', loginLimiter, (req, res) => {
    const { password } = req.body || {};
    if (!password) return res.status(400).json({ success: false, error: 'Password wajib diisi' });

    // Timing-safe compare — hash dulu biar panjang buffer selalu sama (32 byte)
    // mencegah timing attack & RangeError kalau panjang password beda.
    const a = crypto.createHash('sha256').update(String(password)).digest();
    const b = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
    const safe = crypto.timingSafeEqual(a, b);

    if (!safe) {
        return res.status(401).json({ success: false, error: 'Password salah' });
    }

    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: JWT_EXPIRY });

    res.setHeader('Set-Cookie', [
        `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${8 * 60 * 60}; ${process.env.NODE_ENV === 'production' ? 'Secure;' : ''}`
    ]);
    logAudit('LOGIN', 'Admin login', 'admin');
    res.json({ success: true, message: 'Login berhasil' });
});

/**
 * POST /api/admin/logout
 * Hapus cookie.
 */
router.post('/api/admin/logout', (req, res) => {
    res.setHeader('Set-Cookie', [`${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`]);
    res.json({ success: true });
});

/**
 * GET /api/admin/me
 * Cek sesi aktif.
 */
router.get('/api/admin/me', requireAuth, (req, res) => {
    res.json({ success: true, admin: req.admin });
});

// ==================== DASHBOARD ====================

/**
 * GET /api/admin/dashboard
 * Ringkasan: license, deployments, renewals, disk.
 */
router.get('/api/admin/dashboard', requireAuth, adminLimiter, async (req, res) => {
    try {
        const licStats = db.getLicenseStats();
        const deployments = db.getDeployments();
        const renewals = db.getAllRenewals(10);
        const disk = dockerEngine.getDiskUsage();

        const running = deployments.filter(d => d.status === 'running');
        const expired = deployments.filter(d => {
            return d.status === 'running' && d.expires_at && new Date(d.expires_at).getTime() < Date.now();
        });

        // Hitung revenue dari renewals paid
        const paidTotal = db.getPaidRenewalTotal();

        res.json({
            success: true,
            stats: {
                licenses: licStats,
                deployments: { total: deployments.length, running: running.length, expired: expired.length },
                revenue: paidTotal,
                disk
            },
            expiring_soon: db.getExpiringSoon(3),
            recent_renewals: renewals
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ==================== LICENSES ====================

/**
 * GET /api/admin/licenses
 * List semua license.
 */
router.get('/api/admin/licenses', requireAuth, adminLimiter, (req, res) => {
    try {
        const licenses = db.getLicenses().map(l => {
            const dep = db.getDeploymentByLicense(l.key);
            return {
                ...l,
                deployment: dep ? { container_name: dep.container_name, port: dep.port, store_name: dep.store_name, status: dep.status, expires_at: dep.expires_at } : null
            };
        });
        res.json({ success: true, licenses });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /api/admin/licenses { buyer_name, tier }
 * Buat license baru.
 */
router.post('/api/admin/licenses', requireAuth, adminLimiter, (req, res) => {
    try {
        const { buyer_name, tier } = req.body || {};
        if (!buyer_name || !String(buyer_name).trim()) {
            return res.status(400).json({ success: false, error: 'Nama buyer wajib diisi' });
        }
        const validTier = tier === 'chat' ? 'chat' : 'full';
        const license = db.createLicense(String(buyer_name).trim(), '', validTier);
        res.json({ success: true, license });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /api/admin/licenses/:key/tier { tier }
 * Ubah tier license (full/chat). Rebuild container kalau sudah deployed.
 */
router.post('/api/admin/licenses/:key/tier', requireAuth, adminLimiter, async (req, res) => {
    try {
        const key = String(req.params.key || '').toUpperCase();
        const { tier } = req.body || {};
        if (tier !== 'full' && tier !== 'chat') {
            return res.status(400).json({ success: false, error: 'Tier harus full atau chat' });
        }
        const lic = db.getLicenseByKey(key);
        if (!lic) return res.status(404).json({ success: false, error: 'License tidak ditemukan' });

        const updated = db.updateLicenseTier(lic.id, tier);

        // Rebuild kalau sudah deployed (biar env baru berlaku)
        let rebuild = null;
        if (lic.status === 'used') {
            const dep = db.getDeploymentByLicense(key);
            if (dep) {
                try {
                    rebuild = await dockerEngine.rebuildBot(dep.container_name);
                } catch (e) {
                    rebuild = { success: false, error: e.message };
                }
            }
        }

        res.json({ success: true, license: updated, rebuild });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /api/admin/licenses/:key/revoke
 * Revoke license + stop container.
 */
router.post('/api/admin/licenses/:key/revoke', requireAuth, adminLimiter, async (req, res) => {
    try {
        const key = String(req.params.key || '').toUpperCase();
        const lic = db.getLicenseByKey(key);
        if (!lic) return res.status(404).json({ success: false, error: 'License tidak ditemukan' });

        if (lic.status === 'used') {
            const dep = db.getDeploymentByLicense(key);
            if (dep) {
                try { await dockerEngine.stopBot(dep.container_name); } catch (e) { }
                db.updateDeploymentStatus(dep.container_name, 'stopped');
            }
        }

        db.revokeLicense(key);
        res.json({ success: true, message: 'License di-revoke' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ==================== DEPLOYMENTS ====================

/**
 * GET /api/admin/deployments
 * List semua deployment + status container.
 */
router.get('/api/admin/deployments', requireAuth, adminLimiter, async (req, res) => {
    try {
        const deployments = db.getDeployments();
        const enriched = [];
        for (const dep of deployments) {
            let status = { running: false, status: 'unknown', uptime: 0 };
            try {
                status = await dockerEngine.getStatus(dep.container_name);
            } catch (e) { }
            enriched.push({ ...dep, container_status: status });
        }
        res.json({ success: true, deployments: enriched });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /api/admin/deployments/:name/:action
 * Aksi container: start | stop | restart | rebuild | delete
 */
router.post('/api/admin/deployments/:name/:action', requireAuth, adminLimiter, async (req, res) => {
    try {
        const name = String(req.params.name || '');
        const action = String(req.params.action || '');
        const dep = db.getDeploymentByContainer(name);
        if (!dep) return res.status(404).json({ success: false, error: 'Deployment tidak ditemukan' });

        const validActions = ['start', 'stop', 'restart', 'rebuild', 'delete'];
        if (!validActions.includes(action)) {
            return res.status(400).json({ success: false, error: 'Aksi tidak valid' });
        }

        let result;
        switch (action) {
            case 'start':
                result = await dockerEngine.startBot(name);
                if (result.success) db.updateDeploymentStatus(name, 'running');
                break;
            case 'stop':
                result = await dockerEngine.stopBot(name);
                if (result.success) db.updateDeploymentStatus(name, 'stopped');
                break;
            case 'restart':
                result = await dockerEngine.restartBot(name);
                if (result.success) db.updateDeploymentStatus(name, 'running');
                break;
            case 'rebuild':
                result = await dockerEngine.rebuildBot(name);
                if (result.success) db.updateDeploymentStatus(name, 'running');
                break;
            case 'delete':
                try { await dockerEngine.removeBot(name); } catch (e) { }
                db.deleteDeployment(name);
                result = { success: true };
                break;
        }

        res.json({ success: true, action, result });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * GET /api/admin/deployments/:name/logs
 * Log container (last N lines).
 */
router.get('/api/admin/deployments/:name/logs', requireAuth, adminLimiter, async (req, res) => {
    try {
        const name = String(req.params.name || '');
        const lines = parseInt(req.query.lines) || 50;
        const logs = await dockerEngine.getLogs(name, Math.min(lines, 200));
        res.json({ success: true, logs });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /api/admin/deployments/:name/timer { days, mode }
 * Set/Add expiry. mode: 'add' (tambah dari expired) | 'set' (dari sekarang).
 */
router.post('/api/admin/deployments/:name/timer', requireAuth, adminLimiter, (req, res) => {
    try {
        const name = String(req.params.name || '');
        const { days, mode } = req.body || {};
        const d = parseInt(days);
        if (!d || d < 1 || d > 9999) return res.status(400).json({ success: false, error: 'Hari harus 1-9999' });

        const dep = db.getDeploymentByContainer(name);
        if (!dep) return res.status(404).json({ success: false, error: 'Deployment tidak ditemukan' });

        let newExpiry;
        if (mode === 'set') {
            newExpiry = new Date(Date.now() + d * 24 * 60 * 60 * 1000);
        } else {
            const base = dep.expires_at && new Date(dep.expires_at).getTime() > Date.now()
                ? new Date(dep.expires_at) : new Date();
            newExpiry = new Date(base.getTime() + d * 24 * 60 * 60 * 1000);
        }

        db.updateExpiresAt(name, newExpiry.toISOString());
        res.json({ success: true, new_expires_at: newExpiry.toISOString() });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * GET /api/admin/deployments/:name/export
 * Download container data (.tar.gz) — env + db + assets.
 */
router.get('/api/admin/deployments/:name/export', requireAuth, async (req, res) => {
    try {
        const name = String(req.params.name || '');
        const dep = db.getDeploymentByContainer(name);
        if (!dep) return res.status(404).json({ success: false, error: 'Deployment tidak ditemukan' });

        const tarFile = dockerEngine.exportContainer(name);
        if (!tarFile) return res.status(404).json({ success: false, error: 'Data container tidak ditemukan' });

        const safeName = (dep.store_name || name).replace(/[^a-zA-Z0-9_-]/g, '_');
        res.download(tarFile, `${safeName}_export.tar.gz`, () => {
            try { fs.unlinkSync(tarFile); } catch (e) { }
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /api/admin/deployments/:name/backup
 * Backup DB bot → download file .db
 */
router.get('/api/admin/deployments/:name/backup', requireAuth, async (req, res) => {
    try {
        const name = String(req.params.name || '');
        const dep = db.getDeploymentByContainer(name);
        if (!dep) return res.status(404).json({ success: false, error: 'Deployment tidak ditemukan' });

        const backupFile = dockerEngine.backupDatabase(name);
        if (!backupFile) return res.status(404).json({ success: false, error: 'Database tidak ditemukan' });

        const safeName = (dep.store_name || name).replace(/[^a-zA-Z0-9_-]/g, '_');
        res.download(backupFile, `${safeName}_backup.db`, () => {
            try { fs.unlinkSync(backupFile); } catch (e) { }
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /api/admin/deployments/import (multer: file)
 * Import container dari .tar.gz export.
 */
const importUpload = multer({
    dest: path.join(__dirname, '../../uploads/'),
    limits: { fileSize: 200 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.originalname.endsWith('.tar.gz') || file.mimetype === 'application/gzip' || file.mimetype === 'application/x-gzip') {
            cb(null, true);
        } else cb(new Error('File harus .tar.gz'));
    }
});

router.post('/api/admin/deployments/import', requireAuth, importUpload.single('file'), async (req, res) => {
    try {
        const MAX_CONTAINERS = parseInt(process.env.MAX_CONTAINERS) || 8;
        const running = db.getRunningCount();
        if (running >= MAX_CONTAINERS) {
            if (req.file) fs.unlinkSync(req.file.path);
            return res.status(400).json({ success: false, error: `Max containers reached (${running}/${MAX_CONTAINERS})` });
        }
        if (!req.file) return res.status(400).json({ success: false, error: 'File wajib diupload' });

        const usedPorts = db.getUsedPorts();
        const result = await dockerEngine.importContainer(req.file.path, usedPorts);

        // Cleanup
        try { fs.unlinkSync(req.file.path); } catch (e) { }

        if (!result.success) {
            return res.status(500).json({ success: false, error: result.error });
        }

        // Create deployment record
        db.createImportedDeployment({
            buyer_name: result.buyerName,
            container_name: result.containerName,
            port: result.port,
            store_name: result.storeName,
            bot_token: result.botToken
        });

        res.json({
            success: true,
            message: 'Import berhasil',
            container: {
                store_name: result.storeName,
                container_name: result.containerName,
                port: result.port,
                webhook_url: result.webhookUrl
            }
        });
    } catch (e) {
        if (req.file) { try { fs.unlinkSync(req.file.path); } catch (_) { } }
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /api/admin/backup-all
 * Backup semua running container → response list file (tetap di server).
 */
router.post('/api/admin/backup-all', requireAuth, adminLimiter, async (req, res) => {
    try {
        const deployments = db.getDeployments().filter(d => d.status === 'running');
        if (deployments.length === 0) {
            return res.json({ success: true, backups: [], message: 'Tidak ada running container' });
        }

        const backups = [];
        for (const dep of deployments) {
            const file = dockerEngine.backupDatabase(dep.container_name);
            if (file) backups.push({ container: dep.container_name, store: dep.store_name, file });
        }
        res.json({ success: true, backups });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ==================== BOT CONFIG (admin) ====================

const botConfig = require('../services/botConfig');

// Helper: restart container kalau diminta (default: ya)
const maybeRestart = (name, restart) => {
    if (restart !== false) {
        dockerEngine.restartBot(name).catch(() => { });
        return true;
    }
    return false;
};

/**
 * GET /api/admin/deployments/:name/config
 * Ambil konfigurasi bot: gateway, theme, banner, semua env field.
 */
router.get('/api/admin/deployments/:name/config', requireAuth, adminLimiter, (req, res) => {
    try {
        const name = String(req.params.name || '');
        const dep = db.getDeploymentByContainer(name);
        if (!dep) return res.status(404).json({ success: false, error: 'Deployment tidak ditemukan' });
        res.json({ success: true, config: botConfig.getBotConfig(name) });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /api/admin/deployments/:name/config/gateway { provider, credentials, restart }
 * Ganti gateway aktif bot. restart=false → tidak restart (buat save-all).
 */
router.post('/api/admin/deployments/:name/config/gateway', requireAuth, adminLimiter, (req, res) => {
    try {
        const name = String(req.params.name || '');
        const dep = db.getDeploymentByContainer(name);
        if (!dep) return res.status(404).json({ success: false, error: 'Deployment tidak ditemukan' });

        const { provider, credentials, restart } = req.body || {};
        const result = botConfig.setActiveGateway(name, provider, credentials);
        if (!result.success) return res.status(400).json({ success: false, error: result.error });

        const restarted = maybeRestart(name, restart);
        logAudit('GANTI_GATEWAY', `${dep.store_name} → ${provider}${restarted ? ' + restart' : ''}`, 'admin');
        res.json({ success: true, message: `Gateway ${provider} diaktifkan${restarted ? '. Container restarting...' : '. Belum restart.'}` });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /api/admin/deployments/:name/config/theme { theme_preset, restart }
 * Ganti theme QRIS.
 */
router.post('/api/admin/deployments/:name/config/theme', requireAuth, adminLimiter, (req, res) => {
    try {
        const name = String(req.params.name || '');
        const dep = db.getDeploymentByContainer(name);
        if (!dep) return res.status(404).json({ success: false, error: 'Deployment tidak ditemukan' });

        const { theme_preset, restart } = req.body || {};
        const result = botConfig.setTheme(name, theme_preset);
        if (!result.success) return res.status(400).json({ success: false, error: result.error });

        const restarted = maybeRestart(name, restart);
        logAudit('GANTI_THEME', `${dep.store_name} → ${result.theme}${restarted ? ' + restart' : ''}`, 'admin');
        res.json({ success: true, message: `Theme diubah ke ${result.theme}${restarted ? '. Container restarting...' : '. Belum restart.'}` });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /api/admin/deployments/:name/config/banner (multer: banner)
 * Upload banner baru. restart=false → tidak restart.
 */
router.post('/api/admin/deployments/:name/config/banner', requireAuth, upload.single('banner'), (req, res) => {
    try {
        const name = String(req.params.name || '');
        const dep = db.getDeploymentByContainer(name);
        if (!dep) {
            if (req.file) fs.unlinkSync(req.file.path);
            return res.status(404).json({ success: false, error: 'Deployment tidak ditemukan' });
        }
        if (!req.file) return res.status(400).json({ success: false, error: 'File banner wajib diupload' });

        const restart = req.body?.restart !== 'false';
        const result = botConfig.setBanner(name, req.file.path, req.file.originalname);
        try { fs.unlinkSync(req.file.path); } catch (_) { }
        if (!result.success) return res.status(400).json({ success: false, error: result.error });

        const restarted = maybeRestart(name, restart);
        logAudit('GANTI_BANNER', `${dep.store_name}${restarted ? ' + restart' : ''}`, 'admin');
        res.json({ success: true, message: `Banner diperbarui${restarted ? '. Container restarting...' : '. Belum restart.'}` });
    } catch (e) {
        if (req.file) { try { fs.unlinkSync(req.file.path); } catch (_) { } }
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /api/admin/deployments/:name/config/env { env: {...}, restart }
 * Simpan field umum (store_name, support, order_prefix, admin password, dll) ke .env.
 */
router.post('/api/admin/deployments/:name/config/env', requireAuth, adminLimiter, (req, res) => {
    try {
        const name = String(req.params.name || '');
        const dep = db.getDeploymentByContainer(name);
        if (!dep) return res.status(404).json({ success: false, error: 'Deployment tidak ditemukan' });

        const { env, restart } = req.body || {};
        if (!env || typeof env !== 'object') return res.status(400).json({ success: false, error: 'env wajib diisi' });

        // Whitelist key yang boleh diubah
        const allowed = [
            'BOT_TOKEN', 'ADMIN_TELEGRAM_ID',
            'STORE_NAME', 'SUPPORT_USERNAME', 'SUPPORT_HOURS', 'ORDER_PREFIX',
            'ADMIN_PANEL_PASSWORD', 'THEME_PRESET',
            'PAKASIR_API_KEY', 'PAKASIR_SLUG',
            'WIJAYAPAY_CODE_MERCHANT', 'WIJAYAPAY_API_KEY',
            'XOWFTWARE_API_KEY', 'XOWFTWARE_MERCHANT_ID', 'XOWFTWARE_WEBHOOK_SECRET', 'XOWFTWARE_NOTIFY_URL', 'XOWFTWARE_FEE_DIRECTION',
            'KLIKQRIS_API_KEY', 'KLIKQRIS_MERCHANT_ID'
        ];
        const updates = {};
        for (const key of allowed) {
            if (env[key] !== undefined) updates[key] = String(env[key]).trim();
        }
        if (Object.keys(updates).length === 0) return res.status(400).json({ success: false, error: 'Tidak ada field yang valid' });

        const result = botConfig.updateEnv(name, updates);
        if (!result.success) return res.status(400).json({ success: false, error: result.error });

        const restarted = maybeRestart(name, restart);
        logAudit('GANTI_ENV', `${dep.store_name}: ${Object.keys(updates).join(', ')}${restarted ? ' + restart' : ''}`, 'admin');
        res.json({ success: true, updated: Object.keys(updates), restarted, message: `Konfigurasi disimpan${restarted ? '. Container restarting...' : '. Belum restart.'}` });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /api/admin/deployments/:name/config/restart
 * Restart container bot (untuk tombol "Restart" manual).
 */
router.post('/api/admin/deployments/:name/config/restart', requireAuth, adminLimiter, async (req, res) => {
    try {
        const name = String(req.params.name || '');
        const dep = db.getDeploymentByContainer(name);
        if (!dep) return res.status(404).json({ success: false, error: 'Deployment tidak ditemukan' });

        const result = await dockerEngine.restartBot(name);
        logAudit('RESTART_BOT', dep.store_name, 'admin');
        res.json({ success: true, message: 'Container restarting...', result });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ==================== AUDIT LOG ====================

/**
 * GET /api/admin/audit
 * Riwayat aksi admin (login, gateway, theme, banner, revoke, dll).
 */
router.get('/api/admin/audit', requireAuth, adminLimiter, (req, res) => {
    res.json({ success: true, audit: auditLog });
});

module.exports = router;
