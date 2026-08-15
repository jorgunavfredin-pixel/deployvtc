const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const dbFile = process.env.DEPLOY_DB_FILE || path.join(__dirname, '../deploy.db');
const db = new Database(dbFile);
db.pragma('journal_mode = WAL');

// ==================== SCHEMA ====================
db.exec(`
  CREATE TABLE IF NOT EXISTS licenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    buyer_name TEXT,
    telegram_id TEXT,
    tier TEXT DEFAULT 'full',
    status TEXT DEFAULT 'unused',
    initial_days INTEGER DEFAULT 30,
    created_at TEXT,
    used_at TEXT
  );

  CREATE TABLE IF NOT EXISTS deployments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    license_id INTEGER,
    license_key TEXT,
    buyer_name TEXT,
    container_name TEXT UNIQUE,
    port INTEGER UNIQUE,
    store_name TEXT,
    bot_token TEXT,
    status TEXT DEFAULT 'running',
    created_at TEXT,
    expires_at TEXT,
    stopped_at TEXT,
    FOREIGN KEY (license_id) REFERENCES licenses(id)
  );

  CREATE TABLE IF NOT EXISTS renewals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    license_key TEXT,
    order_id TEXT UNIQUE,
    amount INTEGER DEFAULT 0,
    duration_days INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    created_at TEXT,
    paid_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_lic_key ON licenses(key);

  CREATE INDEX IF NOT EXISTS idx_dep_license ON deployments(license_key);
  CREATE INDEX IF NOT EXISTS idx_dep_port ON deployments(port);
  CREATE INDEX IF NOT EXISTS idx_renewal_license ON renewals(license_key);
  CREATE INDEX IF NOT EXISTS idx_renewal_order ON renewals(order_id);

  CREATE TABLE IF NOT EXISTS system_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    details TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_logs_type ON system_logs(type);
  CREATE INDEX IF NOT EXISTS idx_logs_created ON system_logs(created_at);
`);

// Migration: tambah kolom tier ke licenses (Fase 1 — full/chat)
try {
  db.prepare('SELECT tier FROM licenses LIMIT 1').get();
} catch (e) {
  db.exec("ALTER TABLE licenses ADD COLUMN tier TEXT DEFAULT 'full'");
  console.log('[DB] Added tier column to licenses');
}

// Migration: tambah kolom initial_days ke licenses (durasi awal deploy)
try {
  db.prepare('SELECT initial_days FROM licenses LIMIT 1').get();
} catch (e) {
  db.exec('ALTER TABLE licenses ADD COLUMN initial_days INTEGER DEFAULT 30');
  console.log('[DB] Added initial_days column to licenses');
}

// Audit durasi deployment pertama. Bonus Sewa Bot hanya dihitung saat INSERT deployment.
for (const [column, sql] of [
  ['base_days', 'ALTER TABLE deployments ADD COLUMN base_days INTEGER DEFAULT 30'],
  ['bonus_days', 'ALTER TABLE deployments ADD COLUMN bonus_days INTEGER DEFAULT 0'],
  ['rent_bot_enabled', 'ALTER TABLE deployments ADD COLUMN rent_bot_enabled INTEGER DEFAULT 0']
]) {
  try { db.prepare(`SELECT ${column} FROM deployments LIMIT 1`).get(); }
  catch (_) { db.exec(sql); console.log(`[DB] Added ${column} to deployments`); }
}

// Metadata provider untuk renewal KlikQRIS. Migrasi idempoten untuk DB lama.
for (const [column, sql] of [
  ['total_amount', 'ALTER TABLE renewals ADD COLUMN total_amount INTEGER DEFAULT 0'],
  ['provider_signature', 'ALTER TABLE renewals ADD COLUMN provider_signature TEXT'],
  ['provider_expires_at', 'ALTER TABLE renewals ADD COLUMN provider_expires_at TEXT'],
  ['provider_status', 'ALTER TABLE renewals ADD COLUMN provider_status TEXT'],
  ['error_message', 'ALTER TABLE renewals ADD COLUMN error_message TEXT']
]) {
  try { db.prepare(`SELECT ${column} FROM renewals LIMIT 1`).get(); }
  catch (_) { db.exec(sql); console.log(`[DB] Added ${column} to renewals`); }
}

// Migration: container hasil import lama semuanya memakai license_key 'IMPORTED'.
// Kunci itu tidak ada di tabel licenses, jadi buyer tidak bisa renew, dan karena
// nilainya sama untuk semua baris, getDeploymentByLicense hanya menemukan satu.
// Terbitkan lisensi asli untuk tiap baris tersebut. Dijalankan di bawah setelah
// helper lisensi terdefinisi.
let pendingImportedMigration = [];
try {
  pendingImportedMigration = db.prepare("SELECT id, buyer_name FROM deployments WHERE license_key = 'IMPORTED'").all();
} catch (_) {
  pendingImportedMigration = [];
}

// ==================== LICENSE ====================

const generateLicenseKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let key = '';
    const bytes = crypto.randomBytes(32);
    for (let i = 0; i < 32; i++) {
        key += chars[bytes[i] % chars.length];
    }
    return key.match(/.{4}/g).join('-');
};

const createLicense = (buyerName = '', telegramId = '', tier = 'full', initialDays = 30) => {
    const key = generateLicenseKey();
    const created_at = new Date().toISOString();
    const validTier = tier === 'chat' ? 'chat' : 'full';
    const days = parseInt(initialDays) > 0 ? parseInt(initialDays) : 30;
    db.prepare('INSERT INTO licenses (key, buyer_name, telegram_id, tier, status, initial_days, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(key, buyerName, telegramId, validTier, 'unused', days, created_at);
    return { key, buyer_name: buyerName, telegram_id: telegramId, tier: validTier, status: 'unused', initial_days: days, created_at };
};

const validateLicense = (key) => {
    const license = db.prepare('SELECT * FROM licenses WHERE key = ?').get(key);
    if (!license) return { valid: false, reason: 'License key not found' };
    if (license.status === 'used') return { valid: false, reason: 'License already used' };
    if (license.status === 'revoked') return { valid: false, reason: 'License has been revoked' };
    return { valid: true, license };
};

const markLicenseUsed = (key) => {
    db.prepare('UPDATE licenses SET status = ?, used_at = ? WHERE key = ?')
        .run('used', new Date().toISOString(), key);
};

const revokeLicense = (key) => {
    db.prepare('UPDATE licenses SET status = ? WHERE key = ?').run('revoked', key);
};

/**
 * Hapus lisensi dari tabel. Hanya dipanggil setelah route memastikan
 * lisensi berstatus 'revoked' dan container-nya tidak sedang berjalan.
 *
 * Tabel deployments punya FOREIGN KEY ke licenses(id), jadi baris deployment
 * yang masih menunjuk lisensi ini harus dilepas tautannya lebih dulu — kalau
 * tidak, SQLite menolak dengan "FOREIGN KEY constraint failed". Yang dilepas
 * hanya license_id-nya; baris deployment, container, dan datanya dibiarkan
 * utuh karena itu wewenang menu Deployments. license_key sengaja tetap
 * tersimpan sebagai jejak riwayat.
 */
const deleteLicense = (key) => {
    const lic = db.prepare('SELECT id FROM licenses WHERE key = ?').get(key);
    if (!lic) return 0;

    const tx = db.transaction(() => {
        db.prepare('UPDATE deployments SET license_id = NULL WHERE license_id = ?').run(lic.id);
        return db.prepare('DELETE FROM licenses WHERE key = ?').run(key).changes;
    });
    return tx();
};

const updateLicenseTier = (id, tier) => {
    const validTier = tier === 'chat' ? 'chat' : 'full';
    db.prepare('UPDATE licenses SET tier = ? WHERE id = ?').run(validTier, id);
    return db.prepare('SELECT * FROM licenses WHERE id = ?').get(id);
};

const getLicenses = () => {
    return db.prepare('SELECT * FROM licenses ORDER BY created_at DESC').all();
};

const getLicenseByKey = (key) => {
    return db.prepare('SELECT * FROM licenses WHERE key = ?').get(key);
};

const getLicenseStats = () => {
    const all = db.prepare('SELECT status, COUNT(*) as count FROM licenses GROUP BY status').all();
    const stats = { total: 0, unused: 0, used: 0, revoked: 0 };
    all.forEach(r => { stats[r.status] = r.count; stats.total += r.count; });
    const tiers = db.prepare("SELECT tier, COUNT(*) as count FROM licenses GROUP BY tier").all();
    stats.full = tiers.find(t => t.tier === 'full')?.count || 0;
    stats.chat = tiers.find(t => t.tier === 'chat')?.count || 0;
    return stats;
};

// ==================== DEPLOYMENTS ====================

const getUsedPorts = () => {
    return db.prepare("SELECT port FROM deployments WHERE status = 'running'").all().map(r => r.port);
};

const generateRandomPort = () => {
    const usedPorts = getUsedPorts();
    let port;
    do {
        port = 4000 + Math.floor(Math.random() * 4000); // 4000-7999
    } while (usedPorts.includes(port));
    return port;
};

/**
 * Sanitize buyer name for use as container name
 */
const sanitizeContainerName = (buyerName) => {
    return buyerName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 16) || 'buyer';
};

const createDeployment = (data) => {
    const created_at = new Date().toISOString();
    const baseDays = parseInt(data.initial_days) > 0 ? parseInt(data.initial_days) : 30;
    const rentBotEnabled = data.rent_bot_enabled === true || data.rent_bot_enabled === 1;
    const bonusDays = rentBotEnabled ? 14 : 0;
    const totalDays = baseDays + bonusDays;
    const expires_at = new Date(Date.now() + totalDays * 24 * 60 * 60 * 1000).toISOString();
    const result = db.prepare(
        `INSERT INTO deployments (license_id,license_key,buyer_name,container_name,port,store_name,bot_token,status,created_at,expires_at,base_days,bonus_days,rent_bot_enabled)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(data.license_id, data.license_key, data.buyer_name || '', data.container_name, data.port, data.store_name, data.bot_token, 'running', created_at, expires_at, baseDays, bonusDays, rentBotEnabled ? 1 : 0);
    return { id: result.lastInsertRowid, ...data, status: 'running', created_at, expires_at, base_days: baseDays, bonus_days: bonusDays, total_days: totalDays, rent_bot_enabled: rentBotEnabled };
};

const getDeployments = () => {
    return db.prepare('SELECT * FROM deployments ORDER BY created_at DESC').all();
};

const getDeploymentByLicense = (key) => {
    return db.prepare('SELECT * FROM deployments WHERE license_key = ?').get(key);
};

const getDeploymentByContainer = (name) => {
    return db.prepare('SELECT * FROM deployments WHERE container_name = ?').get(name);
};

const updateDeploymentStatus = (containerName, status) => {
    db.prepare('UPDATE deployments SET status = ?, stopped_at = ? WHERE container_name = ?')
        .run(status, status === 'stopped' ? new Date().toISOString() : null, containerName);
};

const getRunningCount = () => {
    return db.prepare("SELECT COUNT(*) as count FROM deployments WHERE status = 'running'").get().count;
};

const getExpiredDeployments = () => {
    const now = new Date().toISOString();
    return db.prepare("SELECT * FROM deployments WHERE status = 'running' AND expires_at <= ?").all(now);
};

// Renewal bisa sudah committed lalu proses mati sebelum container direvive.
// Hanya status 'expired' yang direkonsiliasi; container stopped manual tidak disentuh.
const getRenewedExpiredDeployments = () => {
    const now = new Date().toISOString();
    return db.prepare("SELECT * FROM deployments WHERE status = 'expired' AND expires_at > ?").all(now);
};

const getExpiringSoon = (days = 3) => {
    const future = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();
    return db.prepare("SELECT * FROM deployments WHERE status = 'running' AND expires_at <= ? AND expires_at > ?").all(future, now);
};

const deleteDeployment = (containerName) => {
    db.prepare('DELETE FROM deployments WHERE container_name = ?').run(containerName);
};

const updateExpiresAt = (containerName, newExpiresAt) => {
    db.prepare('UPDATE deployments SET expires_at = ? WHERE container_name = ?')
        .run(newExpiresAt, containerName);
};

// ==================== RENEWALS ====================

const createRenewal = (licenseKey, orderId, amount, durationDays) => {
    const created_at = new Date().toISOString();
    db.prepare('INSERT INTO renewals (license_key, order_id, amount, duration_days, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(licenseKey, orderId, amount, durationDays, 'pending', created_at);
    return { license_key: licenseKey, order_id: orderId, amount, duration_days: durationDays, status: 'pending', created_at };
};

const getRenewalByOrderId = (orderId) => {
    return db.prepare('SELECT * FROM renewals WHERE order_id = ?').get(orderId);
};

const updateRenewalProvider = (orderId, data = {}) => {
    db.prepare(`UPDATE renewals SET
        total_amount = CASE WHEN COALESCE(total_amount, 0) > 0 THEN total_amount ELSE ? END,
        provider_signature = COALESCE(?, provider_signature),
        provider_expires_at = COALESCE(?, provider_expires_at),
        provider_status = ?, error_message = ?
        WHERE order_id = ?`)
        .run(
            Number(data.total_amount || data.total_payment || data.amount || 0),
            data.signature || null,
            data.expired_at || null,
            data.status || null,
            data.error || null,
            orderId
        );
    return getRenewalByOrderId(orderId);
};

const updateRenewalStatus = (orderId, status, error = null) => {
    db.prepare('UPDATE renewals SET status = ?, provider_status = ?, error_message = ? WHERE order_id = ? AND status = ?')
        .run(status, String(status).toUpperCase(), error, orderId, 'pending');
    return getRenewalByOrderId(orderId);
};

const getPendingRenewals = (limit = 50) => db.prepare(
    "SELECT * FROM renewals WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?"
).all(limit);

const getRenewalsByLicense = (licenseKey) => {
    return db.prepare('SELECT * FROM renewals WHERE license_key = ? ORDER BY created_at DESC').all(licenseKey);
};

const markRenewalPaid = (orderId, paidAt) => {
    db.prepare('UPDATE renewals SET status = ?, paid_at = ? WHERE order_id = ?')
        .run('paid', paidAt || new Date().toISOString(), orderId);
    return getRenewalByOrderId(orderId);
};

const getAllRenewals = (limit = 10) => {
    return db.prepare('SELECT * FROM renewals ORDER BY created_at DESC LIMIT ?').all(limit);
};

const getPaidRenewalTotal = () => {
    return db.prepare("SELECT SUM(amount) as total FROM renewals WHERE status = 'paid'").get().total || 0;
};

/**
 * Extend deployment expiry by N days (base = expiry sekarang, bukan hari ini).
 */
const extendDeploymentExpiry = (containerName, days) => {
    const dep = getDeploymentByContainer(containerName);
    if (!dep) return null;
    const base = dep.expires_at && new Date(dep.expires_at).getTime() > Date.now()
        ? new Date(dep.expires_at)
        : new Date();
    const newExpiry = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
    updateExpiresAt(containerName, newExpiry.toISOString());
    return { containerName, oldExpiresAt: dep.expires_at, newExpiresAt: newExpiry.toISOString() };
};

/**
 * Claim + fulfill renewal dalam SATU transaksi SQLite.
 * Webhook, poller, dan tombol manual boleh berlomba; tepat satu jalur yang
 * mengubah pending → paid dan memperpanjang deployment.
 */
const fulfillRenewal = db.transaction((orderId, paidAt) => {
    const renewal = getRenewalByOrderId(orderId);
    if (!renewal) return { claimed: false, reason: 'not_found' };
    if (renewal.status !== 'pending') return { claimed: false, reason: renewal.status, renewal };

    const dep = getDeploymentByLicense(renewal.license_key);
    if (!dep) return { claimed: false, reason: 'deployment_not_found', renewal };

    const base = dep.expires_at && new Date(dep.expires_at).getTime() > Date.now()
        ? new Date(dep.expires_at) : new Date();
    const newExpiry = new Date(base.getTime() + renewal.duration_days * 86400000).toISOString();

    const claim = db.prepare(
        "UPDATE renewals SET status = 'paid', paid_at = ?, provider_status = 'SUCCESS', error_message = NULL WHERE order_id = ? AND status = 'pending'"
    ).run(paidAt || new Date().toISOString(), orderId);
    if (claim.changes !== 1) {
        return { claimed: false, reason: 'already_claimed', renewal: getRenewalByOrderId(orderId) };
    }

    db.prepare('UPDATE deployments SET expires_at = ? WHERE container_name = ?')
        .run(newExpiry, dep.container_name);

    return {
        claimed: true,
        renewal: getRenewalByOrderId(orderId),
        deployment: dep,
        extended: { containerName: dep.container_name, oldExpiresAt: dep.expires_at, newExpiresAt: newExpiry }
    };
});

/**
 * Create deployment record for imported containers.
 *
 * Container hasil import tidak membawa lisensi. Dulu semuanya diberi
 * license_key literal 'IMPORTED', yang menimbulkan dua masalah:
 *   1. getDeploymentByLicense('IMPORTED') hanya mengembalikan SATU baris,
 *      jadi container import kedua dan seterusnya tidak terjangkau.
 *   2. Kunci itu tidak ada di tabel licenses, sehingga /api/renew/check
 *      menjawab "License key not found" dan buyer tidak bisa perpanjang.
 *
 * Sekarang setiap import menerbitkan lisensi asli (status 'used') dan
 * memasangnya ke deployment, sehingga alur renew bekerja sama persis
 * seperti container hasil deploy normal.
 *
 * data.license_key opsional: kalau admin memasok lisensi yang sudah ada
 * (kasus migrasi antar-VPS), lisensi itu dipakai dan tidak diterbitkan
 * yang baru.
 */
const createImportedDeployment = (data) => {
    const created_at = new Date().toISOString();
    const expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const buyerName = data.buyer_name || 'imported';

    let license = null;

    // Pakai lisensi yang dipasok admin kalau valid dan belum dipakai container lain
    if (data.license_key) {
        const existing = getLicenseByKey(String(data.license_key).trim().toUpperCase());
        if (existing && existing.status !== 'revoked' && !getDeploymentByLicense(existing.key)) {
            license = existing;
            if (existing.status === 'unused') markLicenseUsed(existing.key);
        }
    }

    // Kalau tidak ada, terbitkan lisensi baru khusus container ini
    if (!license) {
        license = createLicense(buyerName, '', 'full', 30);
        markLicenseUsed(license.key);
        license = getLicenseByKey(license.key);
    }

    const result = db.prepare(
        'INSERT INTO deployments (license_id, license_key, buyer_name, container_name, port, store_name, bot_token, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(license.id, license.key, buyerName, data.container_name, data.port, data.store_name, data.bot_token || '', 'running', created_at, expires_at);

    return {
        id: result.lastInsertRowid,
        ...data,
        license_key: license.key,
        license_id: license.id,
        buyer_name: buyerName,
        status: 'running',
        created_at,
        expires_at
    };
};

// ==================== SYSTEM LOGS ====================

// Jalankan migrasi 'IMPORTED' di sini — createLicense/markLicenseUsed sudah terdefinisi.
if (pendingImportedMigration.length > 0) {
    for (const row of pendingImportedMigration) {
        try {
            const lic = createLicense(row.buyer_name || 'imported', '', 'full', 30);
            markLicenseUsed(lic.key);
            const full = getLicenseByKey(lic.key);
            db.prepare('UPDATE deployments SET license_key = ?, license_id = ? WHERE id = ?')
                .run(full.key, full.id, row.id);
            console.log(`[DB] Migrasi import: deployment #${row.id} → lisensi ${full.key}`);
        } catch (e) {
            console.error(`[DB] Migrasi import gagal untuk deployment #${row.id}:`, e.message);
        }
    }
    pendingImportedMigration = [];
}

const addSystemLog = (type, message, details = null) => {
    const created_at = new Date().toISOString();
    return db.prepare('INSERT INTO system_logs (type, message, details, created_at) VALUES (?, ?, ?, ?)')
        .run(type, message, details ? JSON.stringify(details) : null, created_at);
};

const getSystemLogs = (type = null, limit = 100, offset = 0) => {
    if (type) {
        return db.prepare('SELECT * FROM system_logs WHERE type = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')
            .all(type, limit, offset);
    }
    return db.prepare('SELECT * FROM system_logs ORDER BY created_at DESC LIMIT ? OFFSET ?')
        .all(limit, offset);
};

const getSystemLogsCount = (type = null) => {
    if (type) {
        return db.prepare('SELECT COUNT(*) as count FROM system_logs WHERE type = ?').get(type).count;
    }
    return db.prepare('SELECT COUNT(*) as count FROM system_logs').get().count;
};

module.exports = {
    generateLicenseKey,
    createLicense,
    validateLicense,
    markLicenseUsed,
    revokeLicense,
    deleteLicense,
    updateLicenseTier,
    getLicenses,
    getLicenseByKey,
    getLicenseStats,
    getUsedPorts,
    generateRandomPort,
    sanitizeContainerName,
    createDeployment,
    createImportedDeployment,
    getDeployments,
    getDeploymentByLicense,
    getDeploymentByContainer,
    updateDeploymentStatus,
    getRunningCount,
    getExpiredDeployments,
    getRenewedExpiredDeployments,
    getExpiringSoon,
    deleteDeployment,
    updateExpiresAt,
    createRenewal,
    getRenewalByOrderId,
    updateRenewalProvider,
    updateRenewalStatus,
    getPendingRenewals,
    getRenewalsByLicense,
    getAllRenewals,
    getPaidRenewalTotal,
    markRenewalPaid,
    extendDeploymentExpiry,
    fulfillRenewal,
    addSystemLog,
    getSystemLogs,
    getSystemLogsCount
};
