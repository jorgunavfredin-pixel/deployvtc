const { execSync } = require('child_process');
const fs = require('fs');
const db = require('./db');
const dockerEngine = require('./docker');

let botRef = null;
let adminIds = [];

const escMd = (t) => String(t || '').replace(/[_*`\[]/g, '\\$&');

// ==================== EXPIRY CRON ====================

/**
 * Start expiry check cron (runs every hour)
 */
const startExpiryCron = (bot, admins) => {
    botRef = bot;
    adminIds = admins;

    // Check every hour
    setInterval(checkExpiredDeployments, 60 * 60 * 1000);
    console.log('⏰ Expiry cron started (checks every hour)');
};

const checkExpiredDeployments = async () => {
    const expired = db.getExpiredDeployments();
    if (expired.length === 0) return;

    for (const dep of expired) {
        try {
            await dockerEngine.stopBot(dep.container_name);
            db.updateDeploymentStatus(dep.container_name, 'expired');

            // Notify admin
            if (botRef && adminIds.length > 0) {
                const msg = `⏰ *Container Expired*\n\n` +
                    `🏪 Store: ${escMd(dep.store_name)}\n` +
                    `👤 Buyer: ${escMd(dep.buyer_name || '-')}\n` +
                    `📦 Container: \`${dep.container_name}\`\n` +
                    `📅 Expired: ${dep.expires_at?.slice(0, 10)}\n\n` +
                    `Container telah di-stop otomatis.`;

                for (const adminId of adminIds) {
                    try {
                        await botRef.telegram.sendMessage(adminId, msg, { parse_mode: 'Markdown' });
                    } catch (e) { }
                }
            }

            console.log(`[CRON] Stopped expired container: ${dep.container_name}`);
        } catch (error) {
            console.error(`[CRON] Failed to stop ${dep.container_name}:`, error.message);
        }
    }
};

// ==================== AUTO BACKUP CRON ====================

const RCLONE_REMOTE = process.env.RCLONE_REMOTE || 'gdrive';
const VPS_IP = process.env.VPS_IP || 'unknown';
const BACKUP_HOUR = parseInt(process.env.BACKUP_HOUR || '3', 10); // Default jam 3 pagi

/**
 * Start auto backup cron — checks every 30 minutes,
 * triggers backup when current hour matches BACKUP_HOUR
 */
let lastBackupDate = null;

const startAutoBackupCron = () => {
    // Check every 30 minutes if it's time to backup
    setInterval(checkAndRunBackup, 30 * 60 * 1000);
    console.log(`💾 Auto backup cron started (daily at ${BACKUP_HOUR}:00 local time → Google Drive)`);
};

const checkAndRunBackup = async () => {
    const now = new Date();
    const currentHour = parseInt(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta', hour: 'numeric', hour12: false }));
    const today = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }); // YYYY-MM-DD WIB

    // Only run at the target hour, and only once per day
    if (currentHour !== BACKUP_HOUR) return;
    if (lastBackupDate === today) return;

    lastBackupDate = today;
    await runAutoBackup();
};

/**
 * Run auto backup for all running deployments
 */
const runAutoBackup = async () => {
    // Check if rclone is installed
    try {
        execSync('rclone version', { stdio: 'pipe' });
    } catch (e) {
        console.error('[BACKUP] rclone not installed. Skipping auto backup.');
        return;
    }

    const deployments = db.getDeployments().filter(d => d.status === 'running');
    if (deployments.length === 0) {
        console.log('[BACKUP] No running deployments, skipping.');
        return;
    }

    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }); // YYYY-MM-DD WIB
    const remotePath = `${RCLONE_REMOTE}:Bot-Backups/${VPS_IP}/${today}`;

    console.log(`[BACKUP] Starting auto backup for ${deployments.length} bots → ${remotePath}`);

    let success = 0, failed = 0;
    const results = [];

    for (const dep of deployments) {
        try {
            const backupFile = dockerEngine.backupDatabase(dep.container_name);
            if (!backupFile) {
                failed++;
                results.push(`❌ ${dep.store_name || dep.container_name} — DB not found`);
                continue;
            }

            // Upload to Google Drive via rclone
            execSync(`rclone copyto "${backupFile}" "${remotePath}/${dep.container_name}.db"`, {
                timeout: 60000 // 60s timeout
            });

            // Delete local backup file
            try { fs.unlinkSync(backupFile); } catch (e) { }

            success++;
            results.push(`✅ ${dep.store_name || dep.container_name}`);
        } catch (e) {
            failed++;
            results.push(`❌ ${dep.store_name || dep.container_name} — ${e.message.slice(0, 50)}`);
        }
    }

    console.log(`[BACKUP] Complete: ${success} success, ${failed} failed`);

    // Notify admin via Telegram
    if (botRef && adminIds.length > 0) {
        const now = new Date();
        const timeStr = now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
        const msg = `💾 *Auto Backup Complete*\n\n` +
            `📅 ${today}\n` +
            `🕐 ${timeStr}\n` +
            `☁️ Google Drive: \`Bot-Backups/${VPS_IP}/${today}/\`\n\n` +
            `📊 *Result:* ${success} ✅  ${failed} ❌\n\n` +
            results.map(r => escMd(r)).join('\n');

        for (const adminId of adminIds) {
            try {
                await botRef.telegram.sendMessage(adminId, msg, { parse_mode: 'Markdown' });
            } catch (e) { }
        }
    }
};

module.exports = { startExpiryCron, checkExpiredDeployments, startAutoBackupCron, runAutoBackup };
