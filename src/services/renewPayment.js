const axios = require('axios');
const db = require('../db');
const dockerEngine = require('../docker');

const POLL_INTERVAL_MS = Math.max(10000, parseInt(process.env.RENEW_POLL_INTERVAL_MS, 10) || 20000);
const inFlight = new Set();
let pollTimer = null;
let bootTimer = null;
let pollRunning = false;

const toAmount = (value, fallback = 0) => {
    if (value === null || value === undefined || value === '') return Number(fallback) || 0;
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n) : (Number(fallback) || 0);
};

const credentials = () => ({
    apiKey: process.env.KLIKQRIS_API_KEY || '',
    merchantId: process.env.KLIKQRIS_MERCHANT_ID || ''
});

const callbackUrlFromRequest = (req) => {
    const configured = String(process.env.RENEW_WEBHOOK_URL || '').trim();
    if (configured) return configured.replace(/\/$/, '');
    const forwardedHost = String(req.get('x-forwarded-host') || '').split(',')[0].trim();
    const host = forwardedHost || req.get('host');
    return `${req.protocol}://${host}/webhook/renew/klikqris`;
};

const createTransaction = async (orderId, amount, description, callbackUrl) => {
    const { apiKey, merchantId } = credentials();
    if (!apiKey || !merchantId) {
        return { success: false, error: 'KlikQRIS credential belum dikonfigurasi di .env panel deploy' };
    }
    try {
        const response = await axios.post('https://klikqris.com/api/qris/create', {
            order_id: orderId,
            id_merchant: merchantId,
            amount: Math.round(amount),
            keterangan: description || `Perpanjangan Lisensi ${orderId}`,
            callback_url: callbackUrl
        }, {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'id_merchant': merchantId
            },
            timeout: 30000,
            validateStatus: () => true
        });
        const body = response.data || {};
        const data = body.data || body;
        if (![200, 201].includes(response.status) || (body.status !== true && !data.qris_url && !data.qris_image)) {
            return {
                success: false,
                statusCode: response.status,
                error: body.message || body.error || `KlikQRIS HTTP ${response.status}`,
                data
            };
        }
        return { success: true, data };
    } catch (error) {
        return {
            success: false,
            statusCode: error.response?.status,
            error: error.response?.data?.message || error.response?.data?.error || error.message
        };
    }
};

const checkStatus = async (orderId) => {
    const { apiKey, merchantId } = credentials();
    if (!apiKey || !merchantId) return { success: false, error: 'KlikQRIS credential belum dikonfigurasi' };
    try {
        const response = await axios.get(`https://klikqris.com/api/qris/status/${encodeURIComponent(orderId)}`, {
            headers: { 'x-api-key': apiKey, 'id_merchant': merchantId },
            timeout: 10000,
            validateStatus: () => true
        });
        const body = response.data || {};
        const data = body.data || body;
        if (response.status !== 200 || body.status === false) {
            return { success: false, statusCode: response.status, error: body.message || body.error || `KlikQRIS HTTP ${response.status}`, data };
        }
        const raw = String(data.status || '').toUpperCase();
        const status = ['SUCCESS', 'PAID', 'COMPLETED'].includes(raw) ? 'completed'
            : ['EXPIRED', 'CANCEL', 'CANCELLED', 'FAILED'].includes(raw) ? 'expired' : 'pending';
        return { success: true, status, rawStatus: raw, data };
    } catch (error) {
        return { success: false, statusCode: error.response?.status, error: error.response?.data?.message || error.message };
    }
};

const reviveDeployment = async (dep) => {
    if (!dep) return null;
    let running = false;
    try {
        const current = await dockerEngine.getStatus(dep.container_name);
        running = current?.running === true;
    } catch (_) { /* start di bawah */ }

    if (!running) {
        const started = await dockerEngine.startBot(dep.container_name);
        if (started.success) db.updateDeploymentStatus(dep.container_name, 'running');
        return { attempted: true, success: started.success === true, error: started.error || null };
    }
    if (dep.status !== 'running') db.updateDeploymentStatus(dep.container_name, 'running');
    return { attempted: false, success: true, error: null };
};

const fulfillVerified = async (orderId, providerData = {}) => {
    if (inFlight.has(orderId)) return { success: true, already_processing: true };
    inFlight.add(orderId);
    try {
        const renewal = db.getRenewalByOrderId(orderId);
        if (!renewal) return { success: false, error: 'Transaksi tidak ditemukan', code: 404 };
        if (renewal.status === 'paid') return { success: true, already_paid: true, renewal };
        if (renewal.status !== 'pending') return { success: false, error: `Transaksi berstatus ${renewal.status}` };

        const paidAmount = toAmount(providerData.total_amount || providerData.total_payment || providerData.amount);
        const expected = toAmount(renewal.total_amount || renewal.amount);
        if (!paidAmount || (expected && paidAmount < expected)) {
            return { success: false, error: `Nominal pembayaran tidak cocok (${paidAmount || 0} < ${expected})` };
        }

        const claim = db.fulfillRenewal(orderId, providerData.paid_at || providerData.payment_date || new Date().toISOString());
        if (!claim.claimed) {
            if (claim.reason === 'paid' || claim.reason === 'already_claimed') {
                return { success: true, already_paid: true, renewal: db.getRenewalByOrderId(orderId) };
            }
            return { success: false, error: claim.reason === 'deployment_not_found' ? 'Deployment untuk license tidak ditemukan' : claim.reason };
        }

        let revived = null;
        try {
            revived = await reviveDeployment(claim.deployment);
        } catch (error) {
            revived = { attempted: true, success: false, error: error.message };
            db.addSystemLog('renewal', `Renewal paid, container gagal dihidupkan: ${claim.deployment.container_name}`, {
                order_id: orderId, error: error.message
            });
        }
        db.addSystemLog('renewal', `Renewal paid: ${orderId}`, {
            license_key: claim.renewal.license_key,
            days: claim.renewal.duration_days,
            amount: claim.renewal.total_amount || claim.renewal.amount,
            revived
        });
        return { success: true, paid: true, extended: claim.extended, revived, renewal: claim.renewal };
    } finally {
        inFlight.delete(orderId);
    }
};

const verifyAndFulfill = async (orderId) => {
    const renewal = db.getRenewalByOrderId(orderId);
    if (!renewal) return { success: false, error: 'Transaksi tidak ditemukan', code: 404 };
    if (renewal.status === 'paid') return { success: true, already_paid: true, renewal };
    if (renewal.status !== 'pending') return { success: true, paid: false, status: renewal.status };

    const checked = await checkStatus(orderId);
    if (!checked.success) return checked;
    db.updateRenewalProvider(orderId, checked.data);
    if (checked.status === 'completed') return fulfillVerified(orderId, checked.data);
    if (checked.status === 'expired') {
        db.updateRenewalStatus(orderId, 'expired');
        return { success: true, paid: false, status: 'expired', message: 'Transaksi kadaluarsa. Silakan buat ulang.' };
    }
    return { success: true, paid: false, status: 'pending', message: 'Pembayaran belum terdeteksi. Silakan cek lagi nanti.' };
};

const pollPendingRenewals = async () => {
    if (pollRunning) return;
    pollRunning = true;
    try {
        const pending = db.getPendingRenewals(50);
        for (const renewal of pending) {
            try { await verifyAndFulfill(renewal.order_id); }
            catch (error) { console.error(`[RENEW POLL] ${renewal.order_id}:`, error.message); }
        }

        // Self-healing bila proses mati setelah DB commit renewal tetapi sebelum
        // container expired sempat dihidupkan kembali.
        for (const dep of db.getRenewedExpiredDeployments()) {
            try { await reviveDeployment(dep); }
            catch (error) { console.error(`[RENEW REVIVE] ${dep.container_name}:`, error.message); }
        }
    } finally {
        pollRunning = false;
    }
};

const startRenewalPolling = () => {
    if (pollTimer) return;
    bootTimer = setTimeout(() => pollPendingRenewals().catch(e => console.error('[RENEW POLL] boot:', e.message)), 5000);
    pollTimer = setInterval(() => pollPendingRenewals().catch(e => console.error('[RENEW POLL]:', e.message)), POLL_INTERVAL_MS);
    console.log(`💳 Renewal polling fallback started (tiap ${POLL_INTERVAL_MS / 1000} detik)`);
};

const stopRenewalPolling = () => {
    if (bootTimer) clearTimeout(bootTimer);
    if (pollTimer) clearInterval(pollTimer);
    bootTimer = null;
    pollTimer = null;
};

module.exports = {
    toAmount,
    callbackUrlFromRequest,
    createTransaction,
    checkStatus,
    fulfillVerified,
    verifyAndFulfill,
    pollPendingRenewals,
    startRenewalPolling,
    stopRenewalPolling
};
