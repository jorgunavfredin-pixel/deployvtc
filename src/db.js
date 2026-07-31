const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const dbFile = path.join(__dirname, '../deploy.db');
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
`);

// Migration: tambah kolom tier ke licenses (Fase 1 — full/chat)
try {
  db.prepare('SELECT tier FROM licenses LIMIT 1').get();
} catch (e) {
  db.exec("ALTER TABLE licenses ADD COLUMN tier TEXT DEFAULT 'full'");
  console.log('[DB] Added tier column to licenses');
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

const createLicense = (buyerName = '', telegramId = '', tier = 'full') => {
    const key = generateLicenseKey();
    const created_at = new Date().toISOString();
    const validTier = tier === 'chat' ? 'chat' : 'full';
    db.prepare('INSERT INTO licenses (key, buyer_name, telegram_id, tier, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(key, buyerName, telegramId, validTier, 'unused', created_at);
    return { key, buyer_name: buyerName, telegram_id: telegramId, tier: validTier, status: 'unused', created_at };
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
    const expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
    const result = db.prepare(
        'INSERT INTO deployments (license_id, license_key, buyer_name, container_name, port, store_name, bot_token, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(data.license_id, data.license_key, data.buyer_name || '', data.container_name, data.port, data.store_name, data.bot_token, 'running', created_at, expires_at);
    return { id: result.lastInsertRowid, ...data, status: 'running', created_at, expires_at };
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

const getRenewalsByLicense = (licenseKey) => {
    return db.prepare('SELECT * FROM renewals WHERE license_key = ? ORDER BY created_at DESC').all(licenseKey);
};

const markRenewalPaid = (orderId, paidAt) => {
    db.prepare('UPDATE renewals SET status = ?, paid_at = ? WHERE order_id = ?')
        .run('paid', paidAt || new Date().toISOString(), orderId);
    return getRenewalByOrderId(orderId);
};

/**
 * Extend deployment expiry by N days (base = expiry sekarang, bukan hari ini).
 */
const extendDeploymentExpiry = (containerName, days) => {
    const dep = db.getDeploymentByContainer(containerName);
    if (!dep) return null;
    const base = dep.expires_at && new Date(dep.expires_at).getTime() > Date.now()
        ? new Date(dep.expires_at)
        : new Date();
    const newExpiry = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
    updateExpiresAt(containerName, newExpiry.toISOString());
    return { containerName, oldExpiresAt: dep.expires_at, newExpiresAt: newExpiry.toISOString() };
};

/**
 * Create deployment record for imported containers (no license)
 */
const createImportedDeployment = (data) => {
    const created_at = new Date().toISOString();
    const expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const result = db.prepare(
        'INSERT INTO deployments (license_id, license_key, buyer_name, container_name, port, store_name, bot_token, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(null, 'IMPORTED', data.buyer_name || 'imported', data.container_name, data.port, data.store_name, data.bot_token || '', 'running', created_at, expires_at);
    return { id: result.lastInsertRowid, ...data, status: 'running', created_at, expires_at };
};

module.exports = {
    generateLicenseKey,
    createLicense,
    validateLicense,
    markLicenseUsed,
    revokeLicense,
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
    getExpiringSoon,
    deleteDeployment,
    updateExpiresAt,
    createRenewal,
    getRenewalByOrderId,
    getRenewalsByLicense,
    markRenewalPaid,
    extendDeploymentExpiry
};
