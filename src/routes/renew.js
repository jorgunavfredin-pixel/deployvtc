const express = require('express');
const axios = require('axios');
const db = require('../db');

const router = express.Router();

// Harga per bulan (Rp). Default 30.000, bisa di-set via env RENEW_PRICE_PER_MONTH.
const RENEW_PRICE_PER_MONTH = parseInt(process.env.RENEW_PRICE_PER_MONTH) || 30000;

// Harga per hari = harga per bulan / 30 (pembulatan ke bawah per hari)
const priceForDays = (days) => {
    const d = Math.max(1, Math.min(3650, parseInt(days) || 0));
    const perDay = Math.floor(RENEW_PRICE_PER_MONTH / 30);
    return { days: d, amount: perDay * d, perDay, pricePerMonth: RENEW_PRICE_PER_MONTH };
};

const klikqrisRenewCreate = async (orderId, amount, description) => {
    const apiKey = process.env.KLIKQRIS_API_KEY || '';
    const merchantId = process.env.KLIKQRIS_MERCHANT_ID || '';
    if (!apiKey || !merchantId) {
        return { success: false, error: 'KlikQRIS credential belum dikonfigurasi di .env panel deploy' };
    }
    try {
        const response = await axios.post('https://klikqris.com/api/qris/create', {
            order_id: orderId,
            id_merchant: merchantId,
            amount: Math.round(amount),
            keterangan: description || `Perpanjangan Lisensi ${orderId}`
        }, {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'id_merchant': merchantId
            },
            timeout: 30000
        });
        const body = response.data || {};
        const data = body.data || body;
        if (body.status !== true && !data.qris_url) {
            return { success: false, error: body.message || body.error || 'Gagal membuat transaksi KlikQRIS' };
        }
        return { success: true, data };
    } catch (error) {
        return { success: false, error: error.response?.data?.message || error.message };
    }
};

const klikqrisRenewStatus = async (orderId) => {
    const apiKey = process.env.KLIKQRIS_API_KEY || '';
    const merchantId = process.env.KLIKQRIS_MERCHANT_ID || '';
    if (!apiKey || !merchantId) return { success: false, error: 'KlikQRIS credential belum dikonfigurasi' };
    try {
        const response = await axios.get(`https://klikqris.com/api/qris/status/${encodeURIComponent(orderId)}`, {
            headers: { 'x-api-key': apiKey, 'id_merchant': merchantId },
            timeout: 10000
        });
        const body = response.data || {};
        const data = body.data || body;
        const raw = String(data.status || '').toUpperCase();
        const status = (raw === 'SUCCESS' || raw === 'PAID') ? 'completed'
            : (raw === 'EXPIRED' || raw === 'CANCEL') ? 'expired' : 'pending';
        return { success: true, status, data };
    } catch (error) {
        return { success: false, error: error.response?.data?.message || error.message };
    }
};

/**
 * GET /api/renew/check?key=LICENSE
 * Cek status license: valid, tier, sisa hari, harga per bulan.
 */
router.get('/api/renew/check', (req, res) => {
    const key = String(req.query.key || '').trim().toUpperCase();
    if (!key) return res.status(400).json({ success: false, error: 'License key wajib diisi' });

    const lic = db.getLicenseByKey(key);
    if (!lic) return res.json({ success: false, reason: 'License key not found' });

    const dep = db.getDeploymentByLicense(key);
    const daysLeft = dep?.expires_at
        ? Math.max(0, Math.ceil((new Date(dep.expires_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
        : 0;
    const renewals = db.getRenewalsByLicense(key);

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
            running: dep ? true : false
        },
        pricing: { price_per_month: RENEW_PRICE_PER_MONTH, price_per_day: Math.floor(RENEW_PRICE_PER_MONTH / 30) },
        renewals
    });
});

/**
 * POST /api/renew/create { key, days }
 * Buat transaksi KlikQRIS untuk perpanjangan. Return signature utk Snap modal.
 */
router.post('/api/renew/create', async (req, res) => {
    try {
        const key = String(req.body.key || '').trim().toUpperCase();
        const days = parseInt(req.body.days);
        if (!key) return res.status(400).json({ success: false, error: 'License key wajib diisi' });
        if (!days || days < 1 || days > 3650) return res.status(400).json({ success: false, error: 'Durasi harus 1-3650 hari' });

        const lic = db.getLicenseByKey(key);
        if (!lic) return res.status(404).json({ success: false, error: 'License key not found' });
        if (lic.status === 'revoked') return res.status(400).json({ success: false, error: 'License telah di-revoke' });

        const { amount } = priceForDays(days);
        const orderId = `REN-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
        const created = db.createRenewal(key, orderId, amount, days);

        const result = await klikqrisRenewCreate(orderId, amount, `Perpanjangan Lisensi (${days} hari)`);
        if (!result.success) {
            return res.status(502).json({ success: false, error: result.error });
        }
        res.json({
            success: true,
            order_id: orderId,
            amount,
            days,
            signature: result.data.signature || null,
            qris_url: result.data.qris_url || null,
            qris_image: result.data.qris_image || null,
            created_at: created.created_at
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/renew/confirm { order_id }
 * Buyer klik "Cek Status": query KlikQRIS, kalau PAID → extend expiry + mark paid.
 */
router.post('/api/renew/confirm', async (req, res) => {
    try {
        const orderId = String(req.body.order_id || '').trim();
        if (!orderId) return res.status(400).json({ success: false, error: 'order_id wajib diisi' });

        const renewal = db.getRenewalByOrderId(orderId);
        if (!renewal) return res.status(404).json({ success: false, error: 'Transaksi tidak ditemukan' });

        if (renewal.status === 'paid') {
            return res.json({ success: true, already_paid: true, renewal });
        }

        const statusResult = await klikqrisRenewStatus(orderId);
        if (!statusResult.success) {
            return res.status(502).json({ success: false, error: statusResult.error });
        }

        if (statusResult.status === 'completed') {
            const dep = db.getDeploymentByLicense(renewal.license_key);
            const extended = dep ? db.extendDeploymentExpiry(dep.container_name, renewal.duration_days) : null;
            const paid = db.markRenewalPaid(orderId, new Date().toISOString());
            return res.json({
                success: true,
                paid: true,
                extended,
                renewal: paid
            });
        }

        if (statusResult.status === 'expired') {
            return res.json({ success: true, paid: false, status: 'expired', message: 'Transaksi kadaluarsa. Silakan buat ulang.' });
        }

        res.json({ success: true, paid: false, status: 'pending', message: 'Pembayaran belum terdeteksi. Silakan cek lagi nanti.' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
