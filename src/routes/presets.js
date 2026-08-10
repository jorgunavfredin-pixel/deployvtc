const express = require('express');
const path = require('path');
const fs = require('fs');

const router = express.Router();

const PRESET_DIR = process.env.QRIS_PRESET_DIR || '/root/vitaicmin/assets/qris-custom/presets';
const PRESET_EXTS = ['.png', '.jpg', '.jpeg', '.webp'];

/**
 * GET /api/qris-presets
 * List preset QRIS dari folder (tanpa base64 — frontend fetch preview per gambar).
 */
router.get('/api/qris-presets', (req, res) => {
    try {
        if (!fs.existsSync(PRESET_DIR)) return res.json({ success: true, presets: [] });
        const files = fs.readdirSync(PRESET_DIR)
            .filter(f => PRESET_EXTS.includes(path.extname(f).toLowerCase()))
            .sort();
        const presets = files.map(f => ({ id: path.basename(f, path.extname(f)), file: f }));
        res.json({ success: true, presets });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * GET /api/qris-preset-preview/:id
 * Kirim gambar preset (browser cache, load per gambar). Content-Type sesuai ekstensi.
 */
router.get('/api/qris-preset-preview/:id', (req, res) => {
    const safeId = String(req.params.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
    try {
        for (const ext of PRESET_EXTS) {
            const p = path.join(PRESET_DIR, `${safeId}${ext}`);
            if (fs.existsSync(p)) {
                const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
                res.setHeader('Content-Type', mime);
                res.setHeader('Cache-Control', 'public, max-age=3600');
                return res.sendFile(p);
            }
        }
        res.status(404).json({ error: 'Preset not found' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * GET /api/config
 */
router.get('/api/config', (req, res) => {
    res.json({
        telegramLink: process.env.TELEGRAM_LINK || 'https://t.me/GREEBEL'
    });
});

module.exports = router;
