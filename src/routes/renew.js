const express = require('express');
const db = require('../db');
const renewPayment = require('../services/renewPayment');

const router = express.Router();

const RENEW_PRICE_PER_MONTH = parseInt(process.env.RENEW_PRICE_PER_MONTH, 10) || 30000;
const priceForDays = (days) => {
    const d = Math.max(1, Math.min(3650, parseInt(days, 10) || 0));
    const perDay = Math.floor(RENEW_PRICE_PER_MONTH / 30);
    return { days: d, amount: perDay * d, perDay, pricePerMonth: RENEW_PRICE_PER_MONTH };
};

const qrImage = (data) => {
    if (data.qris_url) return data.qris_url;
    if (!data.qris_image) return null;
    return String(data.qris_image).startsWith('data:')
        ? data.qris_image
        : `data:image/png;base64,${data.qris_image}`;
};

/**
 * POST /webhook/renew/klikqris
 * Callback renewal dari KlikQRIS. Balas cepat HTTP 200 agar provider tidak retry;
 * payload tidak langsung dipercaya — status selalu di-double-verify ke API.
 */
router.post('/webhook/renew/klikqris', (req, res) => {
    const body = req.body || {};
    const data = body.data || body;
    const orderId = String(data.order_id || data.reference || '').trim();
    if (!orderId) return res.status(400).json({ success: false, error: 'order_id required' });

    const renewal = db.getRenewalByOrderId(orderId);
    if (!renewal) return res.status(404).json({ success: false, error: 'Order not found' });
    if (renewal.status !== 'pending') return res.json({ success: true, duplicate: true });

    const incoming = renewPayment.toAmount(data.total_amount || data.total_payment || data.amount);
    const expected = renewPayment.toAmount(renewal.total_amount || renewal.amount);
    if (incoming && expected && incoming < expected) {
        db.addSystemLog('renewal', `Webhook amount mismatch: ${orderId}`, { incoming, expected });
        return res.status(400).json({ success: false, error: 'Amount mismatch' });
    }

    // Fire-and-forget di event loop Node. verifyAndFulfill melakukan API check,
    // atomic claim, extend expiry, dan revival container.
    renewPayment.verifyAndFulfill(orderId).catch(error => {
        console.error(`[RENEW WEBHOOK] ${orderId}:`, error.message);
        db.addSystemLog('renewal', `Webhook processing failed: ${orderId}`, { error: error.message });
    });
    return res.json({ success: true });
});

/** GET /api/renew/check?key=LICENSE */
router.get('/api/renew/check', (req, res) => {
    const key = String(req.query.key || '').trim().toUpperCase();
    if (!key) return res.status(400).json({ success: false, error: 'License key wajib diisi' });

    const lic = db.getLicenseByKey(key);
    if (!lic) return res.json({ success: false, reason: 'License key not found' });

    const dep = db.getDeploymentByLicense(key);
    const daysLeft = dep?.expires_at
        ? Math.max(0, Math.ceil((new Date(dep.expires_at).getTime() - Date.now()) / 86400000)) : 0;

    res.json({
        success: true,
        license: {
            key,
            buyer_name: lic.buyer_name,
            tier: lic.tier || 'full',
            status: lic.status,
            store_name: dep?.store_name || null,
            port: dep?.port || null,
            expires_at: dep?.expires_at || null,
            days_left: daysLeft,
            running: !!dep
        },
        pricing: {
            price_per_month: RENEW_PRICE_PER_MONTH,
            price_per_day: Math.floor(RENEW_PRICE_PER_MONTH / 30)
        },
        renewals: db.getRenewalsByLicense(key)
    });
});

/** POST /api/renew/create { key, days } */
router.post('/api/renew/create', async (req, res) => {
    try {
        const key = String(req.body.key || '').trim().toUpperCase();
        const days = parseInt(req.body.days, 10);
        if (!key) return res.status(400).json({ success: false, error: 'License key wajib diisi' });
        if (!days || days < 1 || days > 3650) {
            return res.status(400).json({ success: false, error: 'Durasi harus 1-3650 hari' });
        }

        const lic = db.getLicenseByKey(key);
        if (!lic) return res.status(404).json({ success: false, error: 'License key not found' });
        if (lic.status === 'revoked') return res.status(400).json({ success: false, error: 'License telah di-revoke' });
        if (!db.getDeploymentByLicense(key)) {
            return res.status(400).json({ success: false, error: 'License belum memiliki deployment yang dapat diperpanjang' });
        }

        const { amount } = priceForDays(days);
        const orderId = `REN-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
        const created = db.createRenewal(key, orderId, amount, days);
        const callbackUrl = renewPayment.callbackUrlFromRequest(req);
        const result = await renewPayment.createTransaction(
            orderId,
            amount,
            `Perpanjangan Lisensi (${days} hari)`,
            callbackUrl
        );

        if (!result.success) {
            db.updateRenewalStatus(orderId, 'failed', result.error);
            db.addSystemLog('renewal', `KlikQRIS create gagal: ${orderId}`, {
                http_status: result.statusCode || null,
                error: result.error,
                callback_url: callbackUrl
            });
            return res.status(502).json({
                success: false,
                error: result.statusCode ? `KlikQRIS HTTP ${result.statusCode}: ${result.error}` : result.error
            });
        }

        const data = result.data;
        const saved = db.updateRenewalProvider(orderId, data);
        const totalAmount = renewPayment.toAmount(data.total_amount || data.total_payment || data.amount, amount);
        const image = qrImage(data);
        if (!image) {
            db.updateRenewalStatus(orderId, 'failed', 'Response KlikQRIS tidak berisi QR image');
            return res.status(502).json({ success: false, error: 'KlikQRIS tidak mengembalikan gambar QRIS' });
        }

        return res.json({
            success: true,
            order_id: orderId,
            amount: totalAmount,
            base_amount: amount,
            days,
            signature: data.signature || null,
            qris_url: data.qris_url || null,
            qris_image: image,
            expired_at: data.expired_at || null,
            callback_url: callbackUrl,
            created_at: created.created_at,
            renewal: saved
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/renew/status/:order_id
 * Status LOKAL untuk popup buyer. Tidak memanggil KlikQRIS; aman dipoll tiap
 * beberapa detik sementara webhook/poller backend menyelesaikan transaksi.
 */
router.get('/api/renew/status/:orderId', (req, res) => {
    const orderId = String(req.params.orderId || '').trim();
    const renewal = db.getRenewalByOrderId(orderId);
    if (!renewal) return res.status(404).json({ success: false, error: 'Transaksi tidak ditemukan' });

    const dep = db.getDeploymentByLicense(renewal.license_key);
    return res.json({
        success: true,
        paid: renewal.status === 'paid',
        status: renewal.status,
        order_id: renewal.order_id,
        amount: renewal.total_amount || renewal.amount,
        days: renewal.duration_days,
        paid_at: renewal.paid_at || null,
        new_expires_at: renewal.status === 'paid' ? (dep?.expires_at || null) : null
    });
});

/** POST /api/renew/confirm { order_id } — manual fallback buyer */
router.post('/api/renew/confirm', async (req, res) => {
    try {
        const orderId = String(req.body.order_id || '').trim();
        if (!orderId) return res.status(400).json({ success: false, error: 'order_id wajib diisi' });
        const result = await renewPayment.verifyAndFulfill(orderId);
        if (!result.success && result.code === 404) return res.status(404).json(result);
        if (!result.success && result.statusCode) return res.status(502).json(result);
        return res.json(result);
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
