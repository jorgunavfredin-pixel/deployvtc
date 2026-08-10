const Docker = require('dockerode');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

const DATA_DIR = process.env.DATA_DIR || '/root/data';
const TEMPLATE_IMAGE = process.env.BOT_TEMPLATE_IMAGE || 'store-bot';
const VPS_IP = process.env.VPS_IP || 'localhost';

/**
 * Deploy a new bot container for a buyer
 */
const deployBot = async (config) => {
    const { licenseKey, port, envVars, bannerPath, buyerName } = config;

    // Container name from buyer name
    const safeName = (buyerName || 'buyer')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 16);
    const containerName = `bot-${safeName}-${port}`;
    const buyerDir = path.join(DATA_DIR, containerName);

    try {
        // Create buyer data directories
        fs.mkdirSync(path.join(buyerDir, 'db'), { recursive: true });
        fs.mkdirSync(path.join(buyerDir, 'assets'), { recursive: true });
        fs.mkdirSync(path.join(buyerDir, 'logs'), { recursive: true });

        // Write .env file
        const envContent = Object.entries(envVars)
            .map(([key, val]) => {
                if (String(val).includes('#')) return `${key}="${val}"`;
                return `${key}=${val}`;
            })
            .join('\n');
        fs.writeFileSync(path.join(buyerDir, '.env'), envContent);

        // Copy banner if provided (deteksi ekstensi asli: png/jpg/jpeg/webp/gif)
        if (bannerPath && fs.existsSync(bannerPath)) {
            const ext = (path.extname(bannerPath) || '.png').toLowerCase();
            const safeExt = ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext) ? ext : '.png';
            fs.copyFileSync(bannerPath, path.join(buyerDir, 'assets', `banner${safeExt}`));
        } else {
            const defaultBanner = path.join(__dirname, '../assets/banner.png');
            if (fs.existsSync(defaultBanner)) {
                fs.copyFileSync(defaultBanner, path.join(buyerDir, 'assets', 'banner.png'));
            }
        }

        // Copy QRIS preset terpilih ke buyer assets (biar container punya preset)
        // Preset source: folder presets di repo vitaicmin (atau env QRIS_PRESET_DIR)
        // Bot membaca preset dari assets/qris-custom/presets/ — nama file = id preset,
        // jadi harus copy dengan nama file ASLI (qris-1.png, dst), bukan rename.
        const presetSourceDir = process.env.QRIS_PRESET_DIR || '/root/vitaicmin/assets/qris-custom/presets';
        const themePresetId = envVars.THEME_PRESET || '';
        if (themePresetId && fs.existsSync(presetSourceDir)) {
            const presetExts = ['.png', '.jpg', '.jpeg', '.webp'];
            const destPresetDir = path.join(buyerDir, 'assets', 'qris-custom', 'presets');
            fs.mkdirSync(destPresetDir, { recursive: true });
            let copied = false;
            let layout = { x: 23.4375, y: 23.4375, size: 53.125 }; // DEFAULT_LAYOUT vitaicmin
            for (const ext of presetExts) {
                const src = path.join(presetSourceDir, `${themePresetId}${ext}`);
                if (fs.existsSync(src)) {
                    fs.copyFileSync(src, path.join(destPresetDir, `${themePresetId}${ext}`));
                    // Sidecar layout preset (posisi & ukuran QR) — ikut copy kalau ada.
                    const jsonSrc = path.join(presetSourceDir, `${themePresetId}.json`);
                    if (fs.existsSync(jsonSrc)) {
                        try {
                            const meta = JSON.parse(fs.readFileSync(jsonSrc, 'utf8'));
                            const l = meta.layout || meta;
                            if (l && (l.x != null || l.y != null || l.size != null)) {
                                layout = { x: Number(l.x) || layout.x, y: Number(l.y) || layout.y, size: Number(l.size) || layout.size };
                            }
                            fs.copyFileSync(jsonSrc, path.join(destPresetDir, `${themePresetId}.json`));
                        } catch (_) { /* sidecar korup → default layout */ }
                    }
                    copied = true;
                    break;
                }
            }
            if (!copied) {
                // Fallback: copy semua preset yang ada di source biar bot bisa pilih
                const files = fs.readdirSync(presetSourceDir).filter(f => presetExts.includes(path.extname(f).toLowerCase()));
                for (const f of files) fs.copyFileSync(path.join(presetSourceDir, f), path.join(destPresetDir, f));
            }

            // PENTING (fix theme deploy pertama): bot memilih twibbon aktif dari
            // qris_custom_config (DB) atau fallback config.json — BUKAN dari env THEME_PRESET.
            // store.db belum ada saat deploy (bot yang bikin), jadi tulis config.json.
            // Bot baca config.json saat start pertama → preset pilihan member langsung aktif.
            if (copied) {
                try {
                    const qrisConfig = {
                        enabled: true,
                        source: 'preset',
                        preset_id: themePresetId,
                        layout,
                        updated_at: new Date().toISOString()
                    };
                    fs.writeFileSync(
                        path.join(buyerDir, 'assets', 'qris-custom', 'config.json'),
                        JSON.stringify(qrisConfig, null, 2)
                    );
                } catch (_) { /* non-fatal: admin bisa set ulang theme dari panel */ }
            }
        }

        // Create and start container
        const container = await docker.createContainer({
            Image: TEMPLATE_IMAGE,
            name: containerName,
            Env: Object.entries(envVars).map(([k, v]) => `${k}=${v}`),
            ExposedPorts: { '3000/tcp': {} },
            HostConfig: {
                PortBindings: {
                    '3000/tcp': [{ HostPort: String(port) }]
                },
                Binds: [
                    `${buyerDir}/db:/app/src/database`,
                    `${buyerDir}/assets:/app/assets`,
                    `${buyerDir}/logs:/app/logs`
                ],
                RestartPolicy: { Name: 'unless-stopped' }
            }
        });

        await container.start();

        const webhookUrl = `http://${VPS_IP}:${port}/webhook/qris`;

        return {
            success: true,
            containerName,
            port,
            webhookUrl,
            message: 'Bot deployed successfully!'
        };
    } catch (error) {
        try {
            const existing = docker.getContainer(containerName);
            await existing.remove({ force: true });
        } catch (e) { /* ignore */ }

        return { success: false, error: error.message };
    }
};

/**
 * Stop a bot container
 */
const stopBot = async (containerName) => {
    try {
        const container = docker.getContainer(containerName);
        await container.stop();
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

/**
 * Restart a bot container (tanpa ganti env — untuk tombol Restart manual)
 */
const restartBot = async (containerName) => {
    try {
        const container = docker.getContainer(containerName);
        await container.restart();
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

// Helper: baca .env jadi object env vars (dipakai recreate/rebuild)
const readEnvFile = (buyerDir) => {
    const envFile = path.join(buyerDir, '.env');
    if (!fs.existsSync(envFile)) return null;
    const envContent = fs.readFileSync(envFile, 'utf-8');
    const envVars = {};
    for (const line of envContent.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) continue;
        const key = trimmed.slice(0, eqIndex).trim();
        let val = trimmed.slice(eqIndex + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        envVars[key] = val;
    }
    return envVars;
};

/**
 * Recreate bot container dari .env terbaru (env baru langsung kebaca).
 * Data (db/assets/logs) tetap aman karena volume bind.
 * Dipakai oleh "Save & Restart" di konfigurasi bot.
 */
const recreateBot = async (containerName) => {
    const dataDir = process.env.DATA_DIR || '/root/data';
    const buyerDir = path.join(dataDir, containerName);
    try {
        const envVars = readEnvFile(buyerDir);
        if (!envVars) return { success: false, error: '.env file not found in data folder' };

        // Extract port dari WEBHOOK_URL atau nama container
        let port = envVars.WEBHOOK_URL
            ? new URL(envVars.WEBHOOK_URL).port
            : containerName.split('-').pop();

        // Stop & remove container lama (data tetap karena volume)
        try {
            const oldContainer = docker.getContainer(containerName);
            try { await oldContainer.stop(); } catch (e) { /* already stopped */ }
            await oldContainer.remove();
        } catch (e) { /* container might not exist */ }

        // Create baru dengan env terbaru
        const container = await docker.createContainer({
            Image: TEMPLATE_IMAGE,
            name: containerName,
            Env: Object.entries(envVars).map(([k, v]) => `${k}=${v}`),
            ExposedPorts: { '3000/tcp': {} },
            HostConfig: {
                PortBindings: {
                    '3000/tcp': [{ HostPort: String(port) }]
                },
                Binds: [
                    `${buyerDir}/db:/app/src/database`,
                    `${buyerDir}/assets:/app/assets`,
                    `${buyerDir}/logs:/app/logs`
                ],
                RestartPolicy: { Name: 'unless-stopped' }
            }
        });

        await container.start();
        return { success: true, port, recreated: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

/**
 * Remove a bot container and its data
 */
const removeBot = async (containerName) => {
    try {
        const container = docker.getContainer(containerName);
        try { await container.stop(); } catch (e) { /* already stopped */ }
        await container.remove();

        // Hapus folder data
        const dataDir = process.env.DATA_DIR || '/root/data';
        const botDataPath = path.join(dataDir, containerName);
        if (fs.existsSync(botDataPath)) {
            fs.rmSync(botDataPath, { recursive: true, force: true });
        }

        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

/**
 * Get container status and stats
 */
const getStatus = async (containerName) => {
    try {
        const container = docker.getContainer(containerName);
        const info = await container.inspect();
        return {
            running: info.State.Running,
            status: info.State.Status,
            startedAt: info.State.StartedAt,
            uptime: info.State.Running
                ? Math.floor((Date.now() - new Date(info.State.StartedAt).getTime()) / 1000 / 60)
                : 0
        };
    } catch (error) {
        return { running: false, status: 'not found', error: error.message };
    }
};

/**
 * Get container logs
 */
const getLogs = async (containerName, tail = 50) => {
    try {
        const container = docker.getContainer(containerName);
        const logs = await container.logs({
            stdout: true,
            stderr: true,
            tail,
            timestamps: false
        });
        return logs.toString('utf8')
            .split('\n')
            .map(line => line.length > 8 ? line.slice(8) : line)
            .join('\n')
            .trim();
    } catch (error) {
        return `Error: ${error.message}`;
    }
};

/**
 * Backup buyer's database
 * Flushes WAL first so store.db contains ALL data
 */
const backupDatabase = (containerName) => {
    const dataDir = path.join(DATA_DIR, containerName, 'db');
    const dbPath = path.join(dataDir, 'store.db');
    if (!fs.existsSync(dbPath)) return null;

    // Flush WAL → store.db before copying.
    // Kalau checkpoint gagal, data terbaru masih ada di store.db-wal dan tidak ikut backup.
    // Retry 2× dengan delay — kalau tetap gagal, backup dibatalkan (jangan copy file tidak lengkap).
    let walOk = false;
    for (let i = 1; i <= 3; i++) {
        try {
            execSync(
                `docker exec ${containerName} node -e "const db = require('better-sqlite3')('/app/src/database/store.db'); db.pragma('wal_checkpoint(TRUNCATE)'); db.close();"`,
                { timeout: 15000 }
            );
            walOk = true;
            break;
        } catch (e) {
            console.log(`[BACKUP] WAL checkpoint attempt ${i}/3 failed for ${containerName}: ${e.message}`);
            // Delay 2s sebelum retry. Harus SINKRON — fungsi ini bukan async,
            // jadi timers/promises.setTimeout (yang return Promise) tidak akan menunggu.
            if (i < 3) {
                try { execSync('sleep 2', { timeout: 5000 }); } catch (_) { }
            }
        }
    }
    if (!walOk) {
        throw new Error(`WAL checkpoint failed after 3 attempts — aborting backup to prevent incomplete data`);
    }

    const backupDir = path.join(DATA_DIR, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupFile = path.join(backupDir, `${containerName}_${timestamp}.db`);
    fs.copyFileSync(dbPath, backupFile);
    return backupFile;
};

/**
 * List all bot containers
 */
const listContainers = async () => {
    try {
        const containers = await docker.listContainers({
            all: true,
            filters: { name: ['bot-'] }
        });
        return containers.map(c => ({
            name: c.Names[0].replace('/', ''),
            status: c.State,
            created: new Date(c.Created * 1000).toISOString(),
            ports: c.Ports.map(p => p.PublicPort).filter(Boolean)
        }));
    } catch (error) {
        return [];
    }
};

/**
 * Get disk usage info
 */
const getDiskUsage = () => {
    try {
        const output = execSync("df -h / | tail -1").toString().trim();
        const parts = output.split(/\s+/);
        return {
            total: parts[1] || '?',
            used: parts[2] || '?',
            available: parts[3] || '?',
            percent: parts[4] || '?'
        };
    } catch (e) {
        return { total: '?', used: '?', available: '?', percent: '?' };
    }
};

const startBot = async (containerName) => {
    try {
        const container = docker.getContainer(containerName);
        await container.start();
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

/**
 * Rebuild a bot container from latest image, keeping all data
 * Reads .env from data folder, stops+removes old container, creates new one
 */
const rebuildBot = async (containerName) => {
    const dataDir = process.env.DATA_DIR || '/root/data';
    const buyerDir = path.join(dataDir, containerName);
    const envFile = path.join(buyerDir, '.env');

    try {
        // 1. Read .env from data folder
        if (!fs.existsSync(envFile)) {
            return { success: false, error: '.env file not found in data folder' };
        }

        const envContent = fs.readFileSync(envFile, 'utf-8');
        const envVars = {};
        for (const line of envContent.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIndex = trimmed.indexOf('=');
            if (eqIndex === -1) continue;
            const key = trimmed.slice(0, eqIndex).trim();
            let val = trimmed.slice(eqIndex + 1).trim();
            // Remove surrounding quotes
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.slice(1, -1);
            }
            envVars[key] = val;
        }

        // 2. Extract port from WEBHOOK_URL or container name
        let port = envVars.WEBHOOK_URL
            ? new URL(envVars.WEBHOOK_URL).port
            : containerName.split('-').pop();

        // 3. Stop and remove old container (data stays!)
        try {
            const oldContainer = docker.getContainer(containerName);
            try { await oldContainer.stop(); } catch (e) { /* already stopped */ }
            await oldContainer.remove();
        } catch (e) { /* container might not exist */ }

        // 4. Create new container from latest image
        const container = await docker.createContainer({
            Image: TEMPLATE_IMAGE,
            name: containerName,
            Env: Object.entries(envVars).map(([k, v]) => `${k}=${v}`),
            ExposedPorts: { '3000/tcp': {} },
            HostConfig: {
                PortBindings: {
                    '3000/tcp': [{ HostPort: String(port) }]
                },
                Binds: [
                    `${buyerDir}/db:/app/src/database`,
                    `${buyerDir}/assets:/app/assets`,
                    `${buyerDir}/logs:/app/logs`
                ],
                RestartPolicy: { Name: 'unless-stopped' }
            }
        });

        await container.start();

        return { success: true, port };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

/**
 * Export full container data as .tar.gz
 * Includes: .env, db/* (store.db, shm, wal), assets/banner.png
 */
const exportContainer = (containerName) => {
    const buyerDir = path.join(DATA_DIR, containerName);
    if (!fs.existsSync(buyerDir)) return null;

    // Flush WAL first
    try {
        execSync(
            `docker exec ${containerName} node -e "const db = require('better-sqlite3')('/app/src/database/store.db'); db.pragma('wal_checkpoint(TRUNCATE)'); db.close();"`,
            { timeout: 10000 }
        );
    } catch (e) {
        console.log(`[EXPORT] WAL checkpoint failed for ${containerName}, exporting anyway:`, e.message);
    }

    const backupDir = path.join(DATA_DIR, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const tarFile = path.join(backupDir, `${containerName}_${timestamp}.tar.gz`);

    try {
        execSync(`tar -czf "${tarFile}" -C "${DATA_DIR}" "${containerName}"`, { timeout: 30000 });
        return tarFile;
    } catch (e) {
        console.error(`[EXPORT] tar failed:`, e.message);
        return null;
    }
};

/**
 * Import container from .tar.gz
 * Extracts data, generates new port, rewrites .env, creates container
 * Returns { success, containerName, port, webhookUrl, storeName, buyerName }
 */
const importContainer = async (tarPath, usedPorts = []) => {
    const tempDir = path.join(DATA_DIR, '_import_temp');

    try {
        // 1. Extract tar to temp dir
        fs.mkdirSync(tempDir, { recursive: true });
        execSync(`tar -xzf "${tarPath}" -C "${tempDir}"`, { timeout: 30000 });

        // 2. Find the extracted folder (should be 1 folder inside)
        const extracted = fs.readdirSync(tempDir).filter(f =>
            fs.statSync(path.join(tempDir, f)).isDirectory()
        );
        if (extracted.length === 0) throw new Error('No folder found in tar');

        const oldContainerName = extracted[0];
        const extractedDir = path.join(tempDir, oldContainerName);

        // 3. Read .env
        const envFile = path.join(extractedDir, '.env');
        if (!fs.existsSync(envFile)) throw new Error('.env not found in archive');

        const envContent = fs.readFileSync(envFile, 'utf-8');
        const envVars = {};
        for (const line of envContent.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIndex = trimmed.indexOf('=');
            if (eqIndex === -1) continue;
            const key = trimmed.slice(0, eqIndex).trim();
            let val = trimmed.slice(eqIndex + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.slice(1, -1);
            }
            envVars[key] = val;
        }

        // 4. Generate new port (avoid conflicts)
        const allUsedPorts = [...usedPorts];
        let newPort;
        do {
            newPort = 4000 + Math.floor(Math.random() * 4000);
        } while (allUsedPorts.includes(newPort));

        // 5. Extract buyer name from old container name: bot-{name}-{port}
        const nameParts = oldContainerName.replace(/^bot-/, '').split('-');
        nameParts.pop(); // remove old port
        const buyerName = nameParts.join('-') || 'imported';
        const newContainerName = `bot-${buyerName}-${newPort}`;

        // 6. Rewrite .env with new port + webhook (store-bot appends /webhook/qris itself)
        envVars.WEBHOOK_URL = `http://${VPS_IP}:${newPort}`;
        const newEnvContent = Object.entries(envVars)
            .map(([key, val]) => {
                if (String(val).includes('#')) return `${key}="${val}"`;
                return `${key}=${val}`;
            })
            .join('\n');

        // 7. Move data to final location
        const newBuyerDir = path.join(DATA_DIR, newContainerName);
        if (fs.existsSync(newBuyerDir)) throw new Error(`Container ${newContainerName} already exists`);

        fs.renameSync(extractedDir, newBuyerDir);
        fs.writeFileSync(path.join(newBuyerDir, '.env'), newEnvContent);

        // Ensure dirs exist
        fs.mkdirSync(path.join(newBuyerDir, 'db'), { recursive: true });
        fs.mkdirSync(path.join(newBuyerDir, 'assets'), { recursive: true });
        fs.mkdirSync(path.join(newBuyerDir, 'logs'), { recursive: true });

        // 8. Create and start container
        const container = await docker.createContainer({
            Image: TEMPLATE_IMAGE,
            name: newContainerName,
            Env: Object.entries(envVars).map(([k, v]) => `${k}=${v}`),
            ExposedPorts: { '3000/tcp': {} },
            HostConfig: {
                PortBindings: {
                    '3000/tcp': [{ HostPort: String(newPort) }]
                },
                Binds: [
                    `${newBuyerDir}/db:/app/src/database`,
                    `${newBuyerDir}/assets:/app/assets`,
                    `${newBuyerDir}/logs:/app/logs`
                ],
                RestartPolicy: { Name: 'unless-stopped' }
            }
        });

        await container.start();

        const webhookUrl = `http://${VPS_IP}:${newPort}/webhook/qris`;
        const storeName = envVars.STORE_NAME || buyerName;

        return {
            success: true,
            containerName: newContainerName,
            port: newPort,
            webhookUrl,
            storeName,
            buyerName,
            botToken: envVars.BOT_TOKEN ? envVars.BOT_TOKEN.slice(0, 10) + '...' : ''
        };
    } catch (error) {
        return { success: false, error: error.message };
    } finally {
        // Cleanup temp
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) { }
    }
};

// ==================== REBUILD STORE-BOT IMAGE ====================
// Fase 1: git pull repo vitaicmin + docker build image template (store-bot),
// TANPA menyentuh container yang sedang jalan. Log di-stream lewat callback.
// Command HARDCODED (tidak ada input user) untuk cegah injeksi.

const { spawn } = require('child_process');

const BOT_REPO_DIR = process.env.BOT_REPO_DIR || '/root/vitaicmin';
let _rebuildInProgress = false; // lock: cegah build dobel

const isRebuildInProgress = () => _rebuildInProgress;

/**
 * Rebuild image template store-bot.
 * @param {(line:string)=>void} onLog - dipanggil tiap baris output (untuk SSE).
 * @returns {Promise<{success:boolean, code:number, error?:string}>}
 */
const rebuildImage = (onLog = () => {}) => {
    return new Promise((resolve) => {
        if (_rebuildInProgress) {
            return resolve({ success: false, error: 'Rebuild sedang berjalan, tunggu sampai selesai.' });
        }
        if (!fs.existsSync(BOT_REPO_DIR) || !fs.existsSync(path.join(BOT_REPO_DIR, 'Dockerfile'))) {
            return resolve({ success: false, error: `Repo/Dockerfile tidak ditemukan di ${BOT_REPO_DIR}` });
        }
        _rebuildInProgress = true;
        const emit = (l) => { try { onLog(l); } catch (_) {} };

        // Rangkaian command hardcoded: git pull lalu docker build.
        // Pakai bash -lc dengan argumen tetap (bukan string dinamis dari user).
        const script = `set -e
cd ${BOT_REPO_DIR}
echo "▶ git pull ${BOT_REPO_DIR}..."
git pull --ff-only 2>&1 || echo "⚠ git pull gagal/di-skip, lanjut build dengan kode yang ada"
echo "▶ docker build -t ${TEMPLATE_IMAGE} ..."
docker build -t ${TEMPLATE_IMAGE} . 2>&1
echo "✓ Selesai: image ${TEMPLATE_IMAGE} berhasil dibuild."`;

        const child = spawn('bash', ['-lc', script], { cwd: BOT_REPO_DIR });
        const started = Date.now();

        const pipe = (buf) => {
            buf.toString('utf8').split('\n').forEach(line => { if (line.length) emit(line); });
        };
        child.stdout.on('data', pipe);
        child.stderr.on('data', pipe);

        // Guard timeout 15 menit
        const killer = setTimeout(() => {
            emit('✗ Timeout 15 menit — build dibatalkan.');
            try { child.kill('SIGKILL'); } catch (_) {}
        }, 15 * 60 * 1000);

        child.on('close', (code) => {
            clearTimeout(killer);
            _rebuildInProgress = false;
            const dur = Math.round((Date.now() - started) / 1000);
            if (code === 0) {
                emit(`✓ Build sukses dalam ${dur}s. Container LAMA tetap pakai image sebelumnya sampai di-recreate.`);
                resolve({ success: true, code: 0, durationSec: dur });
            } else {
                emit(`✗ Build gagal (exit ${code}) setelah ${dur}s.`);
                resolve({ success: false, code, error: `docker build gagal (exit ${code})` });
            }
        });
        child.on('error', (err) => {
            clearTimeout(killer);
            _rebuildInProgress = false;
            emit('✗ Error: ' + err.message);
            resolve({ success: false, error: err.message });
        });
    });
};

module.exports = {
    deployBot,
    stopBot,
    startBot,
    restartBot,
    recreateBot,
    removeBot,
    rebuildBot,
    getStatus,
    getLogs,
    backupDatabase,
    exportContainer,
    importContainer,
    listContainers,
    getDiskUsage,
    rebuildImage,
    isRebuildInProgress
};
