// Test updateEnv: tulis .env + DB settings bot (key lowercase, skema (key,value)),
// lalu verifikasi lewat resolusi getConfig ala bot: DB > env > fallback.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'botcfg-'));
process.env.DATA_DIR = TMP;
const botConfig = require('../src/services/botConfig');

const NAME = 'bot-test-1';
const dir = path.join(TMP, NAME);
fs.mkdirSync(path.join(dir, 'db'), { recursive: true });

// .env awal seperti hasil deploy
fs.writeFileSync(path.join(dir, '.env'), [
    'BOT_TOKEN=oldtoken',
    'ADMIN_ID=111',
    'STORE_NAME=Toko Lama',
    'ADMIN_PANEL_PASSWORD=oldpass'
].join('\n') + '\n');

// store.db dengan SKEMA ASLI bot: settings(key, value) — tanpa updated_at
const dbPath = path.join(dir, 'db', 'store.db');
const seed = new Database(dbPath);
seed.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)');
seed.exec("INSERT INTO settings (key, value) VALUES ('admin_password_hash','HASHLAMA')");
seed.close();

const readEnvFile = () => {
    const out = {};
    for (const line of fs.readFileSync(path.join(dir, '.env'), 'utf8').split('\n')) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m) out[m[1]] = m[2].replace(/^"|"$/g, '');
    }
    return out;
};

// Replika db.getConfig() bot: settings > process.env > fallback
const getConfig = (settingKey, envKey, fallback = '') => {
    const db = new Database(dbPath, { readonly: true });
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(settingKey);
    db.close();
    if (row && row.value != null && row.value !== '') return row.value;
    const env = readEnvFile();
    if (envKey && env[envKey]) return env[envKey];
    return fallback;
};

test('field live ditulis ke DB settings pakai key lowercase', () => {
    const r = botConfig.updateEnv(NAME, { STORE_NAME: 'Toko Baru', SUPPORT_USERNAME: 'cs_baru' });
    assert.strictEqual(r.success, true);
    assert.strictEqual(r.dbError, null, 'DB write tidak boleh gagal senyap');
    assert.deepStrictEqual(r.live.sort(), ['store_name', 'support_username']);
    // Bot langsung baca nilai baru tanpa restart
    assert.strictEqual(getConfig('store_name', 'STORE_NAME', 'X'), 'Toko Baru');
    assert.strictEqual(getConfig('support_username', 'SUPPORT_USERNAME', 'X'), 'cs_baru');
    // .env juga ikut ter-update
    assert.strictEqual(readEnvFile().STORE_NAME, 'Toko Baru');
});

test('BOT_TOKEN & ADMIN_ID hanya ke .env dan ditandai perlu restart', () => {
    const r = botConfig.updateEnv(NAME, { BOT_TOKEN: 'newtoken', ADMIN_ID: '999' });
    assert.deepStrictEqual(r.needsRestart.sort(), ['ADMIN_ID', 'BOT_TOKEN']);
    assert.deepStrictEqual(r.live, []);
    const env = readEnvFile();
    assert.strictEqual(env.BOT_TOKEN, 'newtoken');
    assert.strictEqual(env.ADMIN_ID, '999');
});

test('key baru di-append ke .env kalau belum ada', () => {
    botConfig.updateEnv(NAME, { SUPPORT_HOURS: '08:00 - 20:00 WIB' });
    assert.strictEqual(readEnvFile().SUPPORT_HOURS, '08:00 - 20:00 WIB');
    assert.strictEqual(getConfig('support_hours', 'SUPPORT_HOURS', 'X'), '08:00 - 20:00 WIB');
});

test('ganti ADMIN_PANEL_PASSWORD hapus hash custom + naikkan session version', () => {
    const r = botConfig.updateEnv(NAME, { ADMIN_PANEL_PASSWORD: 'passbaru' });
    assert.strictEqual(r.dbError, null);
    const db = new Database(dbPath, { readonly: true });
    const hash = db.prepare("SELECT value FROM settings WHERE key='admin_password_hash'").get();
    const ver = db.prepare("SELECT value FROM settings WHERE key='admin_session_version'").get();
    db.close();
    assert.strictEqual(hash, undefined, 'hash lama harus dihapus');
    assert.strictEqual(ver.value, '2', 'sesi lama harus dicabut');
    assert.strictEqual(readEnvFile().ADMIN_PANEL_PASSWORD, 'passbaru');
});

test('getBotConfig: DB settings menang atas .env, admin id dari ADMIN_ID', () => {
    const cfg = botConfig.getBotConfig(NAME).config;
    assert.strictEqual(cfg.store_name, 'Toko Baru');   // dari DB
    assert.strictEqual(cfg.admin_telegram_id, '999');  // dari ADMIN_ID
    assert.strictEqual(cfg.bot_token, 'newtoken');
});

test('nilai dengan spasi tetap utuh saat dibaca ulang', () => {
    botConfig.updateEnv(NAME, { STORE_NAME: 'Toko Spasi # Ada' });
    assert.strictEqual(getConfig('store_name', 'STORE_NAME', 'X'), 'Toko Spasi # Ada');
    assert.strictEqual(botConfig.getBotConfig(NAME).config.store_name, 'Toko Spasi # Ada');
});

test.after(() => fs.rmSync(TMP, { recursive: true, force: true }));
