const express = require('express');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const db = require('../db');
const dockerEngine = require('../docker');

const router = express.Router();

// ==================== AUTH CONFIG ====================

// JWT secret: wajib dari env. Jangan pernah pakai fallback hardcoded.
// Kalau ADMIN_JWT_SECRET tidak di-set, admin panel nonaktif (fail-closed).
const JWT_SECRET = process.env.ADMIN_JWT_SECRET || '';
const JWT_EXPIRY = '8h';
const COOKIE_NAME = 'deploy_admin_token';

// Password admin: wajib dari env. Tanpa password, panel nonaktif.
const ADMIN_PASSWORD = process.env.ADMIN_PANEL_PASSWORD || '';

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

// Fail-closed: kalau secret/password belum di-set, semua endpoint admin mati.
// Hanya berlaku untuk path /api/admin/* — route lain tetap jalan.
router.use((req, res, next) => {
    if (!req.path.startsWith('/api/admin')) return next();
    if (!JWT_SECRET || !ADMIN_PASSWORD) {
        return res.status(503).json({ success: false, error: 'Admin panel belum dikonfigurasi (ADMIN_JWT_SECRET & ADMIN_PANEL_PASSWORD wajib di .env)' });
    }
    next();
});

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

module.exports = router;
