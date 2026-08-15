const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'deployvtc-renew-'));
process.env.DEPLOY_DB_FILE = path.join(tmp, 'test.db');
process.env.KLIKQRIS_API_KEY = 'TEST_KEY';
process.env.KLIKQRIS_MERCHANT_ID = 'TEST_MERCHANT';
process.env.RENEW_PRICE_PER_MONTH = '30000';
delete process.env.RENEW_WEBHOOK_URL;

const axios = require('axios');
const docker = require('../src/docker');
docker.getStatus = async () => ({ running: true, status: 'running' });
docker.startBot = async () => ({ success: true });

const db = require('../src/db');
const renewPayment = require('../src/services/renewPayment');
const renewRouter = require('../src/routes/renew');
const express = require('express');

const license = db.createLicense('Renew Test', '1', 'full', 30);
const licRow = db.getLicenseByKey(license.key);
db.markLicenseUsed(license.key);
db.createDeployment({
    license_id: licRow.id,
    license_key: license.key,
    buyer_name: 'Renew Test',
    container_name: 'bot-renew-test-4999',
    port: 4999,
    store_name: 'Renew Test',
    bot_token: 'redacted',
    initial_days: 30
});

const startApp = async () => {
    const app = express();
    app.set('trust proxy', 1);
    app.use(express.json());
    app.use(renewRouter);
    return new Promise(resolve => {
        const server = app.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
    });
};

const jsonPost = async (url, body, headers = {}) => {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
};

test('create renewal mengirim callback_url publik dan menyimpan total_amount KlikQRIS', async () => {
    let captured;
    axios.post = async (url, payload, options) => {
        captured = { url, payload, options };
        return {
            status: 201,
            data: {
                status: true,
                data: {
                    order_id: payload.order_id,
                    amount: '30000.00',
                    total_amount: '30123.00',
                    status: 'PENDING',
                    qris_url: 'https://klikqris.com/storage/test.png',
                    expired_at: '2026-08-15 01:00:00',
                    signature: 'sig-test'
                }
            }
        };
    };

    const { server, base } = await startApp();
    try {
        const result = await jsonPost(`${base}/api/renew/create`, { key: license.key, days: 30 }, {
            host: 'panel.example.com',
            'x-forwarded-host': 'panel.example.com',
            'x-forwarded-proto': 'https'
        });
        assert.equal(result.status, 200);
        assert.equal(result.body.success, true);
        assert.equal(result.body.amount, 30123);
        assert.equal(captured.url, 'https://klikqris.com/api/qris/create');
        assert.equal(captured.payload.callback_url, 'https://panel.example.com/webhook/renew/klikqris');
        assert.equal(captured.payload.amount, 30000);
        const saved = db.getRenewalByOrderId(result.body.order_id);
        assert.equal(saved.total_amount, 30123);
        assert.equal(saved.provider_signature, 'sig-test');
    } finally { server.close(); }
});

test('webhook PAID di-double-verify lalu fulfill tepat sekali', async () => {
    const order = `REN-WEBHOOK-${Date.now()}`;
    db.createRenewal(license.key, order, 1000, 1);
    db.updateRenewalProvider(order, { total_amount: 1016, signature: 'sig', status: 'PENDING' });
    axios.get = async () => ({
        status: 200,
        data: { status: true, data: { order_id: order, status: 'SUCCESS', amount: '1000.00', total_amount: '1016.00', paid_at: new Date().toISOString() } }
    });

    const before = new Date(db.getDeploymentByLicense(license.key).expires_at).getTime();
    const { server, base } = await startApp();
    try {
        const callback = await jsonPost(`${base}/webhook/renew/klikqris`, {
            order_id: order, status: 'PAID', amount: 1000, total_amount: 1016, signature: 'sig'
        });
        assert.equal(callback.status, 200);
        assert.equal(callback.body.success, true);
        for (let i = 0; i < 30 && db.getRenewalByOrderId(order).status !== 'paid'; i++) {
            await new Promise(r => setTimeout(r, 20));
        }
        assert.equal(db.getRenewalByOrderId(order).status, 'paid');
        const after = new Date(db.getDeploymentByLicense(license.key).expires_at).getTime();
        assert.equal(after - before, 86400000);

        // callback duplikat tidak menambah hari lagi
        await jsonPost(`${base}/webhook/renew/klikqris`, { order_id: order, status: 'PAID', total_amount: 1016 });
        await new Promise(r => setTimeout(r, 30));
        assert.equal(new Date(db.getDeploymentByLicense(license.key).expires_at).getTime(), after);
    } finally { server.close(); }
});

test('polling fallback menyelesaikan pending dan race manual tidak double extend', async () => {
    const order = `REN-POLL-${Date.now()}`;
    db.createRenewal(license.key, order, 2000, 2);
    db.updateRenewalProvider(order, { total_amount: 2020, status: 'PENDING' });
    axios.get = async () => ({
        status: 200,
        data: { status: true, data: { order_id: order, status: 'SUCCESS', amount: 2000, total_amount: 2020 } }
    });

    const before = new Date(db.getDeploymentByLicense(license.key).expires_at).getTime();
    await Promise.all([
        renewPayment.verifyAndFulfill(order),
        renewPayment.verifyAndFulfill(order),
        renewPayment.pollPendingRenewals()
    ]);
    assert.equal(db.getRenewalByOrderId(order).status, 'paid');
    const after = new Date(db.getDeploymentByLicense(license.key).expires_at).getTime();
    assert.equal(after - before, 2 * 86400000);
});

test('amount kurang ditolak dan expiry provider disimpan', async () => {
    const under = `REN-UNDER-${Date.now()}`;
    db.createRenewal(license.key, under, 1000, 1);
    db.updateRenewalProvider(under, { total_amount: 1100, status: 'PENDING' });
    const rejected = await renewPayment.fulfillVerified(under, { status: 'SUCCESS', total_amount: 1099 });
    assert.equal(rejected.success, false);
    assert.equal(db.getRenewalByOrderId(under).status, 'pending');

    const expired = `REN-EXP-${Date.now()}`;
    db.createRenewal(license.key, expired, 1000, 1);
    axios.get = async () => ({ status: 200, data: { status: true, data: { order_id: expired, status: 'EXPIRED', total_amount: 1000 } } });
    const result = await renewPayment.verifyAndFulfill(expired);
    assert.equal(result.status, 'expired');
    assert.equal(db.getRenewalByOrderId(expired).status, 'expired');
});

test('poller menghidupkan ulang deployment expired yang sudah diperpanjang', async () => {
    const dep = db.getDeploymentByLicense(license.key);
    db.updateDeploymentStatus(dep.container_name, 'expired');
    let started = 0;
    docker.getStatus = async () => ({ running: false, status: 'exited' });
    docker.startBot = async () => { started++; return { success: true }; };
    await renewPayment.pollPendingRenewals();
    assert.equal(started, 1);
    assert.equal(db.getDeploymentByLicense(license.key).status, 'running');
});

test.after(() => {
    renewPayment.stopRenewalPolling();
    fs.rmSync(tmp, { recursive: true, force: true });
});