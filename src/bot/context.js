// Shared state & helpers untuk bot handlers.
// Semua handler menerima context ini supaya tidak ada global yang bocor.

const pendingInput = new Map(); // userId -> { type: 'buyer_name' | 'license_tier' | 'timer_days' | 'timer_set_days' | 'import_container', ... }

// Escape Markdown v1 special chars in dynamic values
const escMd = (text) => String(text || '').replace(/[_*`\\[]/g, '\\$&');

const formatUptime = (minutes) => {
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h < 24) return `${h}h ${m}m`;
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
};

const daysLeft = (expiresAt) => {
    if (!expiresAt) return '?';
    const diff = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
};

module.exports = { pendingInput, escMd, formatUptime, daysLeft };
