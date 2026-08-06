const { execSync } = require('child_process');
const fs = require('fs');
const db = require('./db');
const dockerEngine = require('./docker');

// ==================== EXPIRY CRON ====================

/**
 * Start expiry check cron (runs every hour)
 */
const startExpiryCron = () => {
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
const BACKUP_HOUR = parseInt(process.env.BACKUP_HOUR || '3', 10); // Default jam 3 pagi WIB

// Tanggal (WIB) terakhir backup BERHASIL dijalankan. Dipakai supaya:
// 1. Tidak backup dua kali di hari yang sama
// 2. Kalau jam target terlewat (server mati / PM2 restart), backup tetap jalan
//    begitu proses hidup lagi — bukan menunggu besok.
let lastBackupDate = null;

const wibDate = (d = new Date()) => d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
const wibHour = (d = new Date()) => parseInt(d.toLocaleString('en-US', { timeZone: 'Asia/Jakarta', hour: 'numeric', hour12: false }));

/**
 * Start auto backup cron — cek tiap 10 menit.
 * Backup jalan kalau: hari ini belum backup DAN jam WIB sudah melewati BACKUP_HOUR.
 */
const startAutoBackupCron = () => {
    // Cek tiap 10 menit (bukan 30) supaya window lebih rapat
    setInterval(checkAndRunBackup, 10 * 60 * 1000);
    // Cek sekali saat boot — menangkap kasus jadwal terlewat saat server mati
    setTimeout(checkAndRunBackup, 30 * 1000);
    console.log(`💾 Auto backup cron started (harian jam ${BACKUP_HOUR}:00 WIB → Google Drive, catch-up aktif)`);
};

const checkAndRunBackup = async () => {
    const today = wibDate();
    const hour = wibHour();

    // Sudah backup hari ini → skip
    if (lastBackupDate === today) return;
    // Belum waktunya (jam WIB masih di bawah target) → tunggu
    if (hour < BACKUP_HOUR) return;

    // Jam target sudah lewat & hari ini belum backup → jalan sekarang (catch-up)
    const result = await runAutoBackup();
    // Hanya tandai selesai kalau backup benar-benar dieksekusi. Kalau rclone
    // belum terpasang / tidak ada container, biarkan dicoba lagi nanti.
    if (result && result.ran) lastBackupDate = today;
};

/**
 * Verifikasi file benar-benar ada di remote (bukan cuma "perintah tidak error").
 * Return ukuran file di remote, atau null kalau tidak ada.
 */
const verifyRemoteFile = (remoteFile) => {
    try {
        const out = execSync(`rclone lsjson "${remoteFile}"`, { timeout: 60000, stdio: 'pipe' }).toString();
        const arr = JSON.parse(out);
        if (Array.isArray(arr) && arr.length > 0) return arr[0].Size;
        return null;
    } catch (e) {
        return null;
    }
};

/**
 * Upload 1 file ke remote + verifikasi ukurannya cocok. Retry sampai 3×.
 * Return { ok, size, error }
 */
const uploadWithVerify = (localFile, remoteFile, expectedSize) => {
    let lastError = '';
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            execSync(
                `rclone copyto "${localFile}" "${remoteFile}" --timeout 5m --transfers 1 --low-level-retries 3`,
                { timeout: 300000, stdio: 'pipe' }
            );
        } catch (e) {
            lastError = `upload gagal: ${e.message}`;
            if (attempt < 3) { try { execSync('sleep 5', { timeout: 10000 }); } catch (_) { } }
            continue;
        }

        // Upload "sukses" — sekarang BUKTIKAN filenya ada di remote dengan ukuran benar
        const remoteSize = verifyRemoteFile(remoteFile);
        if (remoteSize === null) {
            lastError = 'file tidak ditemukan di remote setelah upload';
        } else if (expectedSize && Number(remoteSize) !== Number(expectedSize)) {
            lastError = `ukuran tidak cocok (lokal ${expectedSize} vs remote ${remoteSize})`;
        } else {
            return { ok: true, size: remoteSize, attempts: attempt };
        }

        if (attempt < 3) { try { execSync('sleep 5', { timeout: 10000 }); } catch (_) { } }
    }
    return { ok: false, error: lastError };
};

/**
 * Run auto backup for all running deployments.
 * Return { ran: boolean, success, failed } — ran=false artinya tidak jadi
 * dieksekusi (rclone belum ada / tidak ada container) supaya bisa dicoba lagi.
 */
const runAutoBackup = async () => {
    // Check if rclone is installed
    try {
        execSync('rclone version', { stdio: 'pipe' });
    } catch (e) {
        console.error('[BACKUP] rclone belum terpasang. Auto backup dilewati.');
        db.addSystemLog('backup', 'Auto backup dilewati — rclone belum terpasang di server', {
            date: wibDate(),
            error: 'rclone not installed'
        });
        return { ran: false, success: 0, failed: 0 };
    }

    const deployments = db.getDeployments().filter(d => d.status === 'running');
    if (deployments.length === 0) {
        console.log('[BACKUP] Tidak ada container running, dilewati.');
        return { ran: false, success: 0, failed: 0 };
    }

    const today = wibDate();
    const remotePath = `${RCLONE_REMOTE}:Bot-Backups/${VPS_IP}/${today}`;

    console.log(`[BACKUP] Mulai auto backup ${deployments.length} bot → ${remotePath}`);

    let success = 0, failed = 0;
    const results = [];

    for (const dep of deployments) {
        const label = dep.store_name || dep.container_name;
        let backupFile = null;
        try {
            // backupDatabase() bisa throw kalau WAL checkpoint gagal
            backupFile = dockerEngine.backupDatabase(dep.container_name);
            if (!backupFile) {
                failed++;
                results.push(`❌ ${label} — DB tidak ditemukan`);
                continue;
            }

            const localSize = fs.statSync(backupFile).size;
            const remoteFile = `${remotePath}/${dep.container_name}.db`;
            const up = uploadWithVerify(backupFile, remoteFile, localSize);

            if (up.ok) {
                success++;
                const retryNote = up.attempts > 1 ? ` (percobaan ke-${up.attempts})` : '';
                results.push(`✅ ${label}${retryNote}`);
            } else {
                failed++;
                results.push(`❌ ${label} — ${String(up.error).slice(0, 60)}`);
            }
        } catch (e) {
            failed++;
            results.push(`❌ ${label} — ${String(e.message).slice(0, 60)}`);
        } finally {
            // Selalu bersihkan file lokal, sukses maupun gagal
            if (backupFile) { try { fs.unlinkSync(backupFile); } catch (_) { } }
        }
    }

    console.log(`[BACKUP] Selesai: ${success} sukses, ${failed} gagal`);

    // Write to system logs (persistent)
    db.addSystemLog('backup', `Auto backup selesai: ${success} ✅ ${failed} ❌`, {
        date: today,
        remote_path: remotePath,
        total: deployments.length,
        success,
        failed,
        verified: true,
        details: results
    });

    return { ran: true, success, failed };
};

module.exports = { startExpiryCron, checkExpiredDeployments, startAutoBackupCron, runAutoBackup };
