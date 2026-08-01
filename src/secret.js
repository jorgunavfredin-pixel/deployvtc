// Auto-generate & persist rahasia admin panel (JWT secret + path rahasia).
// File deploy-secrets.json dibuat otomatis saat boot — tidak perlu set di .env.
// Persist supaya restart server tidak mengubah secret (sesi admin tetap valid).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SECRET_FILE = path.join(__dirname, '../deploy-secrets.json');

const randomHex = (bytes) => crypto.randomBytes(bytes).toString('hex');

function loadOrCreate() {
    // Prioritas: env override > file tersimpan > generate baru
    const envJwt = process.env.ADMIN_JWT_SECRET || '';
    const envPath = process.env.ADMIN_PATH || '';
    const envPass = process.env.ADMIN_PANEL_PASSWORD || '';

    let saved = {};
    try {
        if (fs.existsSync(SECRET_FILE)) {
            saved = JSON.parse(fs.readFileSync(SECRET_FILE, 'utf8'));
        }
    } catch (e) {
        saved = {};
    }

    const jwtSecret = envJwt || saved.jwtSecret || randomHex(32);
    const adminPath = envPath || saved.adminPath || `admin-${randomHex(4)}`;
    // Password: env > file > generate baru (persist biar gak berubah tiap restart)
    const adminPassword = envPass || saved.adminPassword || randomHex(6);

    // Persist (mode 600 — hanya owner yang bisa baca)
    try {
        fs.writeFileSync(SECRET_FILE, JSON.stringify({ jwtSecret, adminPath, adminPassword }, null, 2), { mode: 0o600 });
    } catch (e) {
        console.error('[SECRET] Gagal menyimpan rahasia:', e.message);
    }

    return { jwtSecret, adminPath, adminPassword };
}

module.exports = loadOrCreate();
