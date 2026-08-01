const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const db = require('../db');
const dockerEngine = require('../docker');

const router = express.Router();

const VPS_IP = process.env.VPS_IP || 'localhost';
const DATA_DIR = process.env.DATA_DIR || '/root/data';

// Multer config for banner upload (max 5MB, semua format gambar)
const upload = multer({
    dest: path.join(__dirname, '../../uploads/'),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype && file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only image files allowed'));
    }
});

// ==================== DB BOT HELPERS ====================

const getBotDbPath = (containerName) => path.join(DATA_DIR, containerName, 'db', 'store.db');

const openBotDb = (containerName) => {
    const p = getBotDbPath(containerName);
    if (!fs.existsSync(p)) return null;
    return new Database(p, { readonly: false });
};

const safeParseJson = (s) => {
    try { return JSON.parse(s); } catch { return {}; }
};

const readBotGateways = (containerName) => {
    let ddb = null;
    try {
        ddb = openBotDb(containerName);
        if (!ddb) return { success: false, error: 'store.db tidak ditemukan' };
        const rows = ddb.prepare('SELECT id, provider, label, credentials, enabled, priority FROM payment_gateways ORDER BY priority ASC, created_at ASC').all();
        return { success: true, gateways: rows.map(r => ({ ...r, credentials: safeParseJson(r.credentials) })) };
    } catch (e) {
        return { success: false, error: e.message };
    } finally {
        if (ddb) ddb.close();
    }
};

const getDeploymentForManage = (key) => {
    const lic = db.getLicenseByKey(String(key || '').trim().toUpperCase());
    if (!lic) return { error: 'License key tidak ditemukan', status: 404 };
    if (lic.status !== 'used') return { error: 'License belum dipakai / tidak aktif', status: 400 };
    const dep = db.getDeploymentByLicense(lic.key);
    if (!dep) return { error: 'Bot belum di-deploy untuk license ini', status: 400 };
    return { lic, dep };
};

const readEnv = (containerName) => {
    const envPath = path.join(DATA_DIR, containerName, '.env');
    const env = {};
    if (fs.existsSync(envPath)) {
        fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
            const m = line.match(/^([A-Z0-9_]+)="?([^"]*)"?$/);
            if (m) env[m[1]] = m[2];
        });
    }
    return env;
};

// ==================== ENDPOINTS ====================

/**
 * POST /api/manage/check
 * Cek status bot + daftar gateway + theme + banner (untuk form kelola).
 */
router.post('/api/manage/check', (req, res) => {
    try {
        const { key } = req.body || {};
        const found = getDeploymentForManage(key);
        if (found.error) return res.status(found.status || 400).json({ success: false, error: found.error });
        const { lic, dep } = found;

        const env = readEnv(dep.container_name);
        const gw = readBotGateways(dep.container_name);
        const themePreset = env.THEME_PRESET || '';

        // Banner files
        const assetsDir = path.join(DATA_DIR, dep.container_name, 'assets');
        let bannerFiles = [];
        try {
            if (fs.existsSync(assetsDir)) {
                bannerFiles = fs.readdirSync(assetsDir).filter(f => /^banner\.(png|jpe?g|webp|gif)$/i.test(f));
            }
        } catch (_) { }

        res.json({
            success: true,
            license: { key: lic.key, buyer_name: lic.buyer_name, tier: lic.tier || 'full' },
            deployment: {
                container_name: dep.container_name,
                port: dep.port,
                store_name: dep.store_name,
                status: 'running',
                expires_at: dep.expires_at,
                admin_url: `http://${VPS_IP}:${dep.port}/admin`,
                theme_preset: themePreset,
                banners: bannerFiles
            },
            gateways: gw.success ? gw.gateways : [],
            gateway_error: gw.success ? null : gw.error
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /api/manage/update-gateway
 * Set 1 gateway aktif: nonaktifkan semua, aktifkan/upsert provider terpilih.
 * Tulis ke DB bot + .env + restart container.
 */
router.post('/api/manage/update-gateway', (req, res) => {
    try {
        const { key, provider, credentials } = req.body || {};
        const found = getDeploymentForManage(key);
        if (found.error) return res.status(found.status || 400).json({ success: false, error: found.error });
        const { dep } = found;

        const SUPPORTED = ['pakasir', 'wijayapay', 'xoftware', 'klikqris'];
        if (!SUPPORTED.includes(provider)) return res.status(400).json({ success: false, error: 'Provider tidak valid' });

        const creds = credentials || {};
        // Validasi minimal per provider
        const required = {
            pakasir: ['api_key', 'slug'],
            wijayapay: ['code_merchant', 'api_key'],
            xoftware: ['api_key', 'merchant_id', 'webhook_secret'],
            klikqris: ['api_key', 'merchant_id']
        };
        for (const f of required[provider]) {
            if (!creds[f] || !String(creds[f]).trim()) {
                return res.status(400).json({ success: false, error: `Credential ${f} wajib diisi` });
            }
        }

        const ddb = openBotDb(dep.container_name);
        if (!ddb) return res.status(500).json({ success: false, error: 'store.db tidak ditemukan' });

        try {
            // Nonaktifkan semua gateway
            ddb.prepare('UPDATE payment_gateways SET enabled = 0').run();

            // Upsert gateway provider terpilih
            const existing = ddb.prepare('SELECT id FROM payment_gateways WHERE provider = ?').get(provider);
            const now = new Date().toISOString();
            if (existing) {
                const g = ddb.prepare('SELECT credentials FROM payment_gateways WHERE id = ?').get(existing.id);
                const merged = { ...safeParseJson(g.credentials), ...creds };
                ddb.prepare('UPDATE payment_gateways SET credentials = ?, enabled = 1, updated_at = ? WHERE id = ?')
                    .run(JSON.stringify(merged), now, existing.id);
            } else {
                const id = `GW-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                ddb.prepare('INSERT INTO payment_gateways (id, provider, label, credentials, enabled, priority, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 0, ?, ?)')
                    .run(id, provider, provider, JSON.stringify(creds), now, now);
            }
            ddb.close();
        } catch (e) {
            if (ddb) ddb.close();
            return res.status(500).json({ success: false, error: 'Gagal update DB bot: ' + e.message });
        }

        // Update .env (backward-compat, biar konsisten)
        const envPath = path.join(DATA_DIR, dep.container_name, '.env');
        const envMap = {
            pakasir: { PAKASIR_API_KEY: 'api_key', PAKASIR_SLUG: 'slug' },
            wijayapay: { WIJAYAPAY_CODE_MERCHANT: 'code_merchant', WIJAYAPAY_API_KEY: 'api_key' },
            xoftware: { XOWFTWARE_API_KEY: 'api_key', XOWFTWARE_MERCHANT_ID: 'merchant_id', XOWFTWARE_WEBHOOK_SECRET: 'webhook_secret', XOWFTWARE_NOTIFY_URL: 'registered_notify_url' },
            klikqris: { KLIKQRIS_API_KEY: 'api_key', KLIKQRIS_MERCHANT_ID: 'merchant_id' }
        };
        try {
            if (fs.existsSync(envPath)) {
                let content = fs.readFileSync(envPath, 'utf8');
                const lines = content.split('\n').filter(l => l.trim() !== '');
                // Hapus semua baris gateway lama dari env
                const gatewayKeys = Object.values(envMap).flatMap(m => Object.keys(m));
                const kept = lines.filter(l => {
                    const m = l.match(/^([A-Z0-9_]+)=/);
                    return !(m && gatewayKeys.includes(m[1]));
                });
                // Tambah baris provider terpilih
                const addLines = Object.entries(envMap[provider]).map(([envKey, field]) => {
                    const val = creds[field] || '';
                    return `${envKey}=${String(val).includes('#') ? `"${val}"` : val}`;
                });
                fs.writeFileSync(envPath, [...kept, ...addLines].join('\n') + '\n');
            }
        } catch (_) { /* env update best-effort */ }

        // Restart container
        dockerEngine.restartBot(dep.container_name).catch(() => { });

        res.json({ success: true, message: `Gateway ${provider} diaktifkan. Container restarting...` });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /api/manage/update-theme
 * Ganti theme preset QRIS (copy preset file + update .env + restart).
 */
router.post('/api/manage/update-theme', (req, res) => {
    try {
        const { key, theme_preset } = req.body || {};
        const found = getDeploymentForManage(key);
        if (found.error) return res.status(found.status || 400).json({ success: false, error: found.error });
        const { dep } = found;

        const presetSourceDir = process.env.QRIS_PRESET_DIR || '/root/vitaicmin/assets/qris-custom/presets';
        const id = String(theme_preset || '').replace(/[^a-zA-Z0-9_-]/g, '');
        if (!id) return res.status(400).json({ success: false, error: 'theme_preset tidak valid' });

        const presetExts = ['.png', '.jpg', '.jpeg', '.webp'];
        let src = null;
        for (const ext of presetExts) {
            const p = path.join(presetSourceDir, `${id}${ext}`);
            if (fs.existsSync(p)) { src = p; break; }
        }
        if (!src) return res.status(404).json({ success: false, error: 'Preset tidak ditemukan' });

        // Copy ke buyer assets (nama asli)
        const destDir = path.join(DATA_DIR, dep.container_name, 'assets', 'qris-custom', 'presets');
        fs.mkdirSync(destDir, { recursive: true });
        const ext = path.extname(src);
        fs.copyFileSync(src, path.join(destDir, `${id}${ext}`));

        // Update .env THEME_PRESET
        const envPath = path.join(DATA_DIR, dep.container_name, '.env');
        try {
            if (fs.existsSync(envPath)) {
                let content = fs.readFileSync(envPath, 'utf8');
                if (/^THEME_PRESET=/m.test(content)) {
                    content = content.replace(/^THEME_PRESET=.*$/m, `THEME_PRESET=${id}`);
                } else {
                    content += `\nTHEME_PRESET=${id}\n`;
                }
                fs.writeFileSync(envPath, content);
            }
        } catch (_) { }

        dockerEngine.restartBot(dep.container_name).catch(() => { });
        res.json({ success: true, message: `Theme diubah ke ${id}. Container restarting...` });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /api/manage/update-banner
 * Upload banner baru untuk bot member (multer single 'banner').
 */
router.post('/api/manage/update-banner', upload.single('banner'), (req, res) => {
    try {
        const key = String(req.body?.key || '').trim().toUpperCase();
        const found = getDeploymentForManage(key);
        if (found.error) {
            if (req.file) fs.unlinkSync(req.file.path);
            return res.status(found.status || 400).json({ success: false, error: found.error });
        }
        const { dep } = found;

        if (!req.file) return res.status(400).json({ success: false, error: 'File banner wajib diupload' });

        const ext = (path.extname(req.file.originalname) || '.png').toLowerCase();
        const safeExt = ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext) ? ext : '.png';

        // Hapus banner lama
        const assetsDir = path.join(DATA_DIR, dep.container_name, 'assets');
        if (fs.existsSync(assetsDir)) {
            fs.readdirSync(assetsDir).forEach(f => {
                if (/^banner\.(png|jpe?g|webp|gif)$/i.test(f)) {
                    try { fs.unlinkSync(path.join(assetsDir, f)); } catch (_) { }
                }
            });
        }

        // Copy banner baru
        fs.mkdirSync(assetsDir, { recursive: true });
        fs.copyFileSync(req.file.path, path.join(assetsDir, `banner${safeExt}`));
        fs.unlinkSync(req.file.path);

        dockerEngine.restartBot(dep.container_name).catch(() => { });

        res.json({ success: true, message: 'Banner diperbarui. Container restarting...' });
    } catch (e) {
        if (req.file) { try { fs.unlinkSync(req.file.path); } catch (_) { } }
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
