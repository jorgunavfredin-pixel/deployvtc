// Shared logic untuk baca/tulis konfigurasi bot member (gateway/theme/banner).
// Dipakai oleh admin panel (routes/admin.js).
// Semua operasi menulis langsung ke DB bot (buyerDir/db/store.db) + .env,
// TANPA menyentuh data lain (produk, order, saldo).

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || '/root/data';

const getBotDbPath = (containerName) => path.join(DATA_DIR, containerName, 'db', 'store.db');

const openBotDb = (containerName) => {
    const p = getBotDbPath(containerName);
    if (!fs.existsSync(p)) return null;
    return new Database(p, { readonly: false });
};

const safeParseJson = (s) => {
    try { return JSON.parse(s); } catch { return {}; }
};

const PROVIDER_REQUIRED = {
    pakasir: ['api_key', 'slug'],
    wijayapay: ['code_merchant', 'api_key'],
    xoftware: ['api_key', 'merchant_id', 'webhook_secret'],
    klikqris: ['api_key', 'merchant_id']
};

const ENV_MAP = {
    pakasir: { PAKASIR_API_KEY: 'api_key', PAKASIR_SLUG: 'slug' },
    wijayapay: { WIJAYAPAY_CODE_MERCHANT: 'code_merchant', WIJAYAPAY_API_KEY: 'api_key' },
    xoftware: { XOWFTWARE_API_KEY: 'api_key', XOWFTWARE_MERCHANT_ID: 'merchant_id', XOWFTWARE_WEBHOOK_SECRET: 'webhook_secret', XOWFTWARE_NOTIFY_URL: 'registered_notify_url' },
    klikqris: { KLIKQRIS_API_KEY: 'api_key', KLIKQRIS_MERCHANT_ID: 'merchant_id' }
};

const SUPPORTED_PROVIDERS = Object.keys(ENV_MAP);

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

/**
 * Peta ENV (uppercase, .env) → key tabel settings bot (lowercase).
 * Bot pakai db.getConfig(settingKey, ENV_KEY, fallback):
 *   prioritas 1 = settings[settingKey]  → live, tanpa restart
 *   prioritas 2 = process.env[ENV_KEY]  → butuh restart container
 * Hanya key di peta ini yang bisa live-update; sisanya env-only.
 */
const ENV_TO_SETTING = {
    STORE_NAME: 'store_name',
    SUPPORT_TELEGRAM_URL: 'support_telegram_url',
    ORDER_PREFIX: 'order_prefix',
    PAYMENT_TIMEOUT_MINUTES: 'payment_timeout_minutes'
};

// Key yang cuma dibaca saat bot start (Telegraf init / docker env) → wajib restart.
const RESTART_ONLY_KEYS = ['BOT_TOKEN', 'ADMIN_ID', 'THEME_PRESET', 'ADMIN_PANEL_PASSWORD'];

// Update sebagian nilai .env (key-value) tanpa menghapus key lain.
// Juga tulis ke DB settings table (prioritas bot = DB > .env).
const updateEnv = (containerName, updates) => {
    const envPath = path.join(DATA_DIR, containerName, '.env');
    if (!fs.existsSync(envPath)) return { success: false, error: '.env tidak ditemukan' };
    const content = fs.readFileSync(envPath, 'utf8');
    const lines = content.split('\n');
    const seen = new Set();
    const out = lines.map(line => {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m && updates[m[1]] !== undefined) {
            seen.add(m[1]);
            const val = String(updates[m[1]]);
            return `${m[1]}=${val.includes('#') || val.includes(' ') ? `"${val}"` : val}`;
        }
        return line;
    });
    // Key baru yang belum ada di file
    for (const [k, v] of Object.entries(updates)) {
        if (!seen.has(k)) out.push(`${k}=${String(v).includes('#') || String(v).includes(' ') ? `"${v}"` : v}`);
    }
    fs.writeFileSync(envPath, out.join('\n'));

    // Tulis juga ke DB settings bot supaya langsung live tanpa restart.
    // PENTING: bot baca lewat db.getConfig(settingKey, ENV_KEY) dengan key
    // lowercase (mis. 'store_name'), dan tabelnya cuma (key, value).
    const live = [];
    let dbError = null;
    const mapped = Object.entries(updates)
        .filter(([k]) => ENV_TO_SETTING[k])
        .map(([k, v]) => [ENV_TO_SETTING[k], String(v)]);

    // Ganti password panel: hash custom di DB bot menang atas .env, jadi hash
    // lama harus dihapus + sesi lama dicabut supaya password baru dari .env dipakai.
    const resetPanelPassword = updates.ADMIN_PANEL_PASSWORD !== undefined;

    if (mapped.length || resetPanelPassword) {
        let ddb = null;
        try {
            ddb = openBotDb(containerName);
            if (ddb) {
                ddb.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)');
                const upsert = ddb.prepare(
                    'INSERT INTO settings (key, value) VALUES (?, ?) ' +
                    'ON CONFLICT(key) DO UPDATE SET value = excluded.value'
                );
                ddb.transaction(() => {
                    for (const [k, v] of mapped) { upsert.run(k, v); live.push(k); }

                    if (resetPanelPassword) {
                        ddb.prepare("DELETE FROM settings WHERE key = 'admin_password_hash'").run();
                        const row = ddb.prepare("SELECT value FROM settings WHERE key = 'admin_session_version'").get();
                        const next = (parseInt(row && row.value) || 1) + 1;
                        upsert.run('admin_session_version', String(next));
                        live.push('admin_password_hash(reset)');
                    }
                })();
            }
        } catch (e) {
            dbError = e.message;
        } finally {
            if (ddb) { try { ddb.close(); } catch (_) { } }
        }
    }

    const keys = Object.keys(updates);
    return {
        success: true,
        updated: keys,
        live,                                                  // efektif tanpa restart
        needsRestart: keys.filter(k => !ENV_TO_SETTING[k]),    // baru jalan setelah restart
        dbError
    };
};

const getBannerFiles = (containerName) => {
    const assetsDir = path.join(DATA_DIR, containerName, 'assets');
    try {
        if (fs.existsSync(assetsDir)) {
            return fs.readdirSync(assetsDir).filter(f => /^banner\.(png|jpe?g|webp|gif)$/i.test(f));
        }
    } catch (_) { }
    return [];
};

/**
 * Ambil konfigurasi lengkap bot (gateway + theme + banner + semua env field).
 * Prioritas: DB settings > .env (DB override .env jika key ada di keduanya).
 */
const getBotConfig = (containerName) => {
    const env = readEnv(containerName);

    // Overlay dari DB settings (prioritas sama seperti bot: DB > .env).
    // Key DB lowercase → dipetakan balik ke ENV uppercase.
    let ddb = null;
    try {
        ddb = openBotDb(containerName);
        if (ddb) {
            const rows = ddb.prepare('SELECT key, value FROM settings').all();
            const settingToEnv = Object.fromEntries(
                Object.entries(ENV_TO_SETTING).map(([e, s]) => [s, e])
            );
            for (const r of rows) {
                const envKey = settingToEnv[r.key];
                if (envKey && r.value != null && r.value !== '') env[envKey] = r.value;
            }
        }
    } catch (_) { /* tabel settings belum ada → pakai .env saja */ } finally {
        if (ddb) { try { ddb.close(); } catch (_) { } }
    }
    const gw = readBotGateways(containerName);
    return {
        gateways: gw.success ? gw.gateways : [],
        gateway_error: gw.success ? null : gw.error,
        theme_preset: env.THEME_PRESET || '',
        banners: getBannerFiles(containerName),
        // Semua field yang bisa di-edit (seperti deploy awal)
        config: {
            bot_token: env.BOT_TOKEN || '',
            // Bot pakai ADMIN_ID (bukan ADMIN_TELEGRAM_ID) — lihat src/index.js bot
            admin_telegram_id: env.ADMIN_ID || env.ADMIN_TELEGRAM_ID || '',
            store_name: env.STORE_NAME || '',
            support_telegram_url: env.SUPPORT_TELEGRAM_URL || '',
            order_prefix: env.ORDER_PREFIX || '',
            admin_panel_password: env.ADMIN_PANEL_PASSWORD || '',
            theme_preset: env.THEME_PRESET || '',
            pakasir_api_key: env.PAKASIR_API_KEY || '',
            pakasir_slug: env.PAKASIR_SLUG || '',
            wijayapay_code_merchant: env.WIJAYAPAY_CODE_MERCHANT || '',
            wijayapay_api_key: env.WIJAYAPAY_API_KEY || '',
            xoftware_api_key: env.XOWFTWARE_API_KEY || '',
            xoftware_merchant_id: env.XOWFTWARE_MERCHANT_ID || '',
            xoftware_webhook_secret: env.XOWFTWARE_WEBHOOK_SECRET || '',
            xoftware_notify_url: env.XOWFTWARE_NOTIFY_URL || '',
            xoftware_fee_direction: env.XOWFTWARE_FEE_DIRECTION || 'merchant',
            klikqris_api_key: env.KLIKQRIS_API_KEY || '',
            klikqris_merchant_id: env.KLIKQRIS_MERCHANT_ID || ''
        }
    };
};

/**
 * Set 1 gateway aktif: nonaktifkan semua, aktifkan/upsert provider terpilih.
 * Tulis ke DB bot + .env.
 */
const setActiveGateway = (containerName, provider, credentials) => {
    if (!SUPPORTED_PROVIDERS.includes(provider)) return { success: false, error: 'Provider tidak valid' };

    const creds = credentials || {};
    for (const f of PROVIDER_REQUIRED[provider]) {
        if (!creds[f] || !String(creds[f]).trim()) {
            return { success: false, error: `Credential ${f} wajib diisi` };
        }
    }

    const ddb = openBotDb(containerName);
    if (!ddb) return { success: false, error: 'store.db tidak ditemukan' };

    try {
        ddb.prepare('UPDATE payment_gateways SET enabled = 0').run();
        const existing = ddb.prepare('SELECT id, credentials FROM payment_gateways WHERE provider = ?').get(provider);
        const now = new Date().toISOString();
        if (existing) {
            const merged = { ...safeParseJson(existing.credentials), ...creds };
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
        return { success: false, error: 'Gagal update DB bot: ' + e.message };
    }

    // Update .env (backward-compat)
    try {
        const envPath = path.join(DATA_DIR, containerName, '.env');
        if (fs.existsSync(envPath)) {
            let content = fs.readFileSync(envPath, 'utf8');
            const lines = content.split('\n').filter(l => l.trim() !== '');
            const gatewayKeys = Object.values(ENV_MAP).flatMap(m => Object.keys(m));
            const kept = lines.filter(l => {
                const m = l.match(/^([A-Z0-9_]+)=/);
                return !(m && gatewayKeys.includes(m[1]));
            });
            const addLines = Object.entries(ENV_MAP[provider]).map(([envKey, field]) => {
                const val = creds[field] || '';
                return `${envKey}=${String(val).includes('#') ? `"${val}"` : val}`;
            });
            fs.writeFileSync(envPath, [...kept, ...addLines].join('\n') + '\n');
        }
    } catch (_) { }

    return { success: true, provider };
};

/**
 * Ganti theme preset QRIS (copy file + update .env).
 */
const setTheme = (containerName, themePreset) => {
    const presetSourceDir = process.env.QRIS_PRESET_DIR || '/root/vitaicmin/assets/qris-custom/presets';
    const id = String(themePreset || '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!id) return { success: false, error: 'theme_preset tidak valid' };

    const presetExts = ['.png', '.jpg', '.jpeg', '.webp'];
    let src = null;
    for (const ext of presetExts) {
        const p = path.join(presetSourceDir, `${id}${ext}`);
        if (fs.existsSync(p)) { src = p; break; }
    }
    if (!src) return { success: false, error: 'Preset tidak ditemukan' };

    const destDir = path.join(DATA_DIR, containerName, 'assets', 'qris-custom', 'presets');
    fs.mkdirSync(destDir, { recursive: true });
    const ext = path.extname(src);
    fs.copyFileSync(src, path.join(destDir, `${id}${ext}`));

    const envPath = path.join(DATA_DIR, containerName, '.env');
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

    return { success: true, theme: id };
};

/**
 * Ganti banner toko (hapus banner lama, copy baru).
 * uploadedPath: path file sementara dari multer. originalName: nama asli upload.
 */
const setBanner = (containerName, uploadedPath, originalName) => {
    const ext = (path.extname(originalName || '') || '.png').toLowerCase();
    const safeExt = ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext) ? ext : '.png';

    const assetsDir = path.join(DATA_DIR, containerName, 'assets');
    if (fs.existsSync(assetsDir)) {
        fs.readdirSync(assetsDir).forEach(f => {
            if (/^banner\.(png|jpe?g|webp|gif)$/i.test(f)) {
                try { fs.unlinkSync(path.join(assetsDir, f)); } catch (_) { }
            }
        });
    }

    fs.mkdirSync(assetsDir, { recursive: true });
    fs.copyFileSync(uploadedPath, path.join(assetsDir, `banner${safeExt}`));
    return { success: true, file: `banner${safeExt}` };
};

module.exports = {
    getBotConfig,
    setActiveGateway,
    setTheme,
    setBanner,
    updateEnv,
    readBotGateways,
    readEnv,
    SUPPORTED_PROVIDERS,
    ENV_TO_SETTING,
    RESTART_ONLY_KEYS
};
