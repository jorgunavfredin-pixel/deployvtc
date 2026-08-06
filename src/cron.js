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
    botRef = bot || null;
    adminIds = admins || [];

    // Check every hour
    setInterval(checkExpiredDeployments, 60 * 60 * 1000);
    console.log('⏰ Expiry cron started (checks every hour)');
};

const checkExpiredDeployments = async () => {
    const expired = db.getExpiredDeployments();
    if (expired.length === 0) return;

    const results = [];
    for (const dep of expired) {
        try {
            await dockerEngine.stopBot(dep.container_name);
            db.updateDeploymentStatus(dep.container_name, 'expired');

            const logMsg = `Container expired: ${dep.store_name || dep.container_name} (${dep.buyer_name || '-'})`;
            results.push(`✅ ${logMsg}`);
            
            console.log(`[CRON] Stopped expired container: ${dep.container_name}`);
        } catch (error) {
            const errMsg = `Failed to stop ${dep.container_name}: ${error.message}`;
            results.push(`❌ ${errMsg}`);
            console.error(`[CRON] ${errMsg}`);
        }
    }

    // Write to system logs (persistent)
    db.addSystemLog('expiry', `Checked ${expired.length} expired containers`, {
        stopped: results.filter(r => r.startsWith('✅')).length,
        failed: results.filter(r => r.startsWith('❌')).length,
        details: results
    });
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
            // 60 detik cukup untuk DB < 10 MB; DB lebih besar butuh lebih lama
            // tambah flag --timeout dan --transfers untuk network lambat
            execSync(`rclone copyto "${backupFile}" "${remotePath}/${dep.container_name}.db" --timeout 5m --transfers 1 --low-level-retries 3`, {
                timeout: 300000, // 5 menit
                stdio: 'pipe'
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

    // Write to system logs (persistent)
    db.addSystemLog('backup', `Auto backup complete: ${success} ✅ ${failed} ❌`, {
        date: today,
        remote_path: remotePath,
        total: deployments.length,
        success,
        failed,
        details: results
    });
};

module.exports = { startExpiryCron, checkExpiredDeployments, startAutoBackupCron, runAutoBackup };
