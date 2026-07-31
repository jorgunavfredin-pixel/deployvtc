const { Telegraf, Markup } = require('telegraf');
const db = require('./db');
const dockerEngine = require('./docker');
const { startExpiryCron, startAutoBackupCron } = require('./cron');
const fs = require('fs');
const path = require('path');

let bot = null;

// Simple in-memory state for pending inputs
const pendingInput = new Map(); // userId -> { type: 'buyer_name' }

// Escape Markdown v1 special chars in dynamic values
const escMd = (text) => String(text || '').replace(/[_*`\[]/g, '\\$&');

// ==================== HELPERS ====================

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

// ==================== INIT BOT ====================

const initBot = () => {
    const token = process.env.DEPLOY_BOT_TOKEN;
    if (!token || token === 'your_license_bot_token_here') {
        console.log('[BOT] No DEPLOY_BOT_TOKEN set, license bot disabled');
        return null;
    }

    bot = new Telegraf(token);
    const ADMIN_ID = process.env.ADMIN_ID || '';
    const adminIds = ADMIN_ID.split(',').map(id => id.trim());
    const MAX_CONTAINERS = parseInt(process.env.MAX_CONTAINERS) || 8;

    // Admin-only middleware
    bot.use((ctx, next) => {
        if (!ctx.from) return;
        if (!adminIds.includes(ctx.from.id.toString())) {
            return ctx.reply('⛔ Access denied. Admin only.');
        }
        return next();
    });

    // ==================== MAIN MENU ====================

    const showMainMenu = async (ctx, edit = false) => {
        const running = db.getRunningCount();
        const stats = db.getLicenseStats();
        const expiring = db.getExpiringSoon(3);

        let msg = `🔐 *Vitacimin Deploy — Admin Panel*\n\n`;
        msg += `📦 Active: *${running}/${MAX_CONTAINERS}* containers\n`;
        msg += `🔑 Licenses: *${stats.total}* total (*${stats.unused}* unused)\n`;
        if (expiring.length > 0) {
            msg += `⏰ Expiring soon: *${expiring.length}*\n`;
        }

        const buttons = [
            [Markup.button.callback('🔑 License Manager', 'menu_license')],
            [Markup.button.callback('📦 Deployments', 'menu_deploy')],
            [Markup.button.callback('📊 System Status', 'menu_system')],
            [Markup.button.callback('💾 Backup All', 'action_backup_all')]
        ];

        const opts = { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) };

        if (edit) {
            try { await ctx.editMessageText(msg, opts); } catch { await ctx.reply(msg, opts); }
        } else {
            await ctx.reply(msg, opts);
        }
    };

    bot.telegram.setMyCommands([
        { command: 'start', description: 'Mulai' }
    ]);

    bot.command('start', (ctx) => showMainMenu(ctx, false));
    bot.action('menu_home', (ctx) => { ctx.answerCbQuery(); showMainMenu(ctx, true); });

    // ==================== LICENSE MANAGER ====================

    bot.action('menu_license', async (ctx) => {
        await ctx.answerCbQuery();
        const stats = db.getLicenseStats();

        const msg = `🔑 *License Manager*\n\n` +
            `📊 Total: ${stats.total}\n` +
            `🟢 Unused: ${stats.unused}\n` +
            `🔵 Used: ${stats.used}\n` +
            `🔴 Revoked: ${stats.revoked}`;

        await ctx.editMessageText(msg, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('➕ Create License', 'lic_create')],
                [Markup.button.callback('🟢 Unused', 'lic_list_unused'), Markup.button.callback('🔵 Used', 'lic_list_used')],
                [Markup.button.callback('🔴 Revoked', 'lic_list_revoked'), Markup.button.callback('📋 All', 'lic_list_all')],
                [Markup.button.callback('◀ Back', 'menu_home')]
            ])
        });
    });

    // Create License — ask for buyer name
    bot.action('lic_create', async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.editMessageText(
            '➕ *Create License*\n\nKetik nama buyer:',
            { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'menu_license')]]) }
        );
        pendingInput.set(ctx.from.id.toString(), { type: 'buyer_name' });
    });

    // Handle text input for buyer name
    bot.on('text', async (ctx) => {
        const userId = ctx.from.id.toString();
        const pending = pendingInput.get(userId);
        if (pending?.type === 'buyer_name') {
            pendingInput.delete(userId);
            const buyerName = ctx.message.text.trim();
            // Ask for tier
            pendingInput.set(userId, { type: 'license_tier', buyerName });
            await ctx.reply(
                `👤 Buyer: *${escMd(buyerName)}*\n\n` +
                `Pilih tier license:\n\n` +
                `🟢 *full* — Admin Web + Admin Chat Bot (fitur lengkap)\n` +
                `🔵 *chat* — Admin Chat Bot saja (tanpa web)\n\n` +
                `Ketik \`full\` atau \`chat\`:`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('🟢 Full (Web + Chat)', 'lic_tier_full')],
                        [Markup.button.callback('🔵 Chat saja', 'lic_tier_chat')],
                        [Markup.button.callback('❌ Cancel', 'menu_license')]
                    ])
                }
            );
            return;
        }

        if (pending?.type === 'license_tier') {
            const input = ctx.message.text.trim().toLowerCase();
            if (input !== 'full' && input !== 'chat') {
                await ctx.reply('❌ Ketik `full` atau `chat` saja.', { parse_mode: 'Markdown' });
                return;
            }
            pendingInput.delete(userId);
            const { buyerName } = pending;
            const license = db.createLicense(buyerName, '', input);

            await ctx.reply(
                `🎉 *Terima kasih atas pembeliannya, ${buyerName}!*\n\n` +
                `🔑 *License Key Kamu:*\n\`${license.key}\`\n\n` +
                `━━━━━━━━━━━━━━━━━━\n\n` +
                `📋 *Cara Deploy Bot:*\n\n` +
                `1️⃣ *Siapkan dulu:*\n` +
                `• 🤖 Bot Token → buat di @BotFather\n` +
                `• 🆔 Telegram ID → cek di @userinfobot\n` +
                `• 🏪 Nama Toko (maks 30 karakter)\n` +
                `• 📝 Format ID Pesanan (misal: ORD, INV)\n` +
                `• 💳 API Key PaKasir → daftar di pakasir.com\n` +
                `• 📱 Slug PaKasir\n` +
                `• 🖼 Banner Toko (PNG, maks 2MB)\n\n` +
                `2️⃣ *Buka link deploy:*\n` +
                `🌐 ${/^\d/.test(process.env.VPS_IP || '') ? 'http://' + process.env.VPS_IP + ':' + (process.env.PORT || '800') : 'https://' + process.env.VPS_IP}/\n` +
                `3️⃣ Masukkan License Key + data di atas, klik *Deploy!*\n\n` +
                `⏳ Tunggu 1-2 menit, bot kamu siap dipakai ✨\n` +
                `Kalo masih bingung tanyakan langsung ya 💬`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('➕ Create Another', 'lic_create')],
                        [Markup.button.callback('◀ Back', 'menu_license')]
                    ])
                }
            );
            return;
        }

        // Handle manual timer input (add days)
        if (pending?.type === 'timer_days') {
            pendingInput.delete(userId);
            const input = ctx.message.text.trim();
            const addDays = parseInt(input);

            if (isNaN(addDays) || addDays < 1 || addDays > 9999) {
                await ctx.reply('❌ Input tidak valid. Ketik angka 1-9999.', {
                    ...Markup.inlineKeyboard([[Markup.button.callback('⏰ Kembali', `dep_timer_${pending.containerName}`)]])
                });
                return;
            }

            const dep = db.getDeploymentByContainer(pending.containerName);
            if (!dep) {
                await ctx.reply('❌ Container tidak ditemukan.');
                return;
            }

            const currentExpiry = dep.expires_at ? new Date(dep.expires_at) : new Date();
            const newExpiry = new Date(currentExpiry.getTime() + addDays * 24 * 60 * 60 * 1000);
            db.updateExpiresAt(pending.containerName, newExpiry.toISOString());

            const daysRemaining = Math.max(0, Math.ceil((newExpiry.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));

            await ctx.reply(
                `✅ *Expiry Updated!*\n\n` +
                `🏪 ${escMd(dep.store_name)}\n` +
                `📅 Expired baru: ${newExpiry.toISOString().slice(0, 10)}\n` +
                `⏳ Sisa: ${daysRemaining} hari lagi\n\n` +
                `+${addDays} hari ditambahkan dari expired sebelumnya.`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('⏰ Timer', `dep_timer_${pending.containerName}`)],
                        [Markup.button.callback('◀ Back', `dep_detail_${pending.containerName}`)]
                    ])
                }
            );
            return;
        }

        // Handle set timer input (set exact days from now)
        if (pending?.type === 'timer_set_days') {
            pendingInput.delete(userId);
            const input = ctx.message.text.trim();
            const setDays = parseInt(input);

            if (isNaN(setDays) || setDays < 1 || setDays > 9999) {
                await ctx.reply('❌ Input tidak valid. Ketik angka 1-9999.', {
                    ...Markup.inlineKeyboard([[Markup.button.callback('⏰ Kembali', `dep_timer_${pending.containerName}`)]])
                });
                return;
            }

            const dep = db.getDeploymentByContainer(pending.containerName);
            if (!dep) {
                await ctx.reply('❌ Container tidak ditemukan.');
                return;
            }

            const newExpiry = new Date(Date.now() + setDays * 24 * 60 * 60 * 1000);
            db.updateExpiresAt(pending.containerName, newExpiry.toISOString());

            await ctx.reply(
                `✅ *Expiry Set!*\n\n` +
                `🏪 ${escMd(dep.store_name)}\n` +
                `📅 Expired: ${newExpiry.toISOString().slice(0, 10)}\n` +
                `⏳ Sisa: ${setDays} hari dari sekarang`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('⏰ Timer', `dep_timer_${pending.containerName}`)],
                        [Markup.button.callback('◀ Back', `dep_detail_${pending.containerName}`)]
                    ])
                }
            );
            return;
        }
    });

    // Tier selected via inline buttons
    const finishCreateLicense = async (ctx, tier) => {
        const userId = ctx.from.id.toString();
        const pending = pendingInput.get(userId);
        if (!pending || pending.type !== 'license_tier') {
            await ctx.answerCbQuery('Session tidak ditemukan. Coba lagi.');
            return;
        }
        pendingInput.delete(userId);
        const { buyerName } = pending;
        const license = db.createLicense(buyerName, '', tier);

        const tierLabel = tier === 'chat' ? '🔵 Chat saja' : '🟢 Full (Web + Chat)';
        await ctx.answerCbQuery();
        await ctx.reply(
            `🎉 *Terima kasih atas pembeliannya, ${buyerName}!*\n\n` +
            `🔑 *License Key Kamu:*\n\`${license.key}\`\n\n` +
            `🎛 *Tier:* ${tierLabel}\n\n` +
            `━━━━━━━━━━━━━━━━━━\n\n` +
            `📋 *Cara Deploy Bot:*\n\n` +
            `1️⃣ *Siapkan dulu:*\n` +
            `• 🤖 Bot Token → buat di @BotFather\n` +
            `• 🆔 Telegram ID → cek di @userinfobot\n` +
            `• 🏪 Nama Toko (maks 30 karakter)\n` +
            `• 📝 Format ID Pesanan (misal: ORD, INV)\n` +
            `• 💳 API Key Payment Gateway (PaKasir/WijayaPay/Xoftware/KlikQRIS)\n` +
            `• 🖼 Banner Toko (PNG/JPG, maks 2MB)\n\n` +
            `2️⃣ *Buka link deploy:*\n` +
            `🌐 ${/^\d/.test(process.env.VPS_IP || '') ? 'http://' + process.env.VPS_IP + ':' + (process.env.PORT || '800') : 'https://' + process.env.VPS_IP}/\n` +
            `3️⃣ Masukkan License Key + data di atas, klik *Deploy!*\n\n` +
            `⏳ Tunggu 1-2 menit, bot kamu siap dipakai ✨\n` +
            `Kalo masih bingung tanyakan langsung ya 💬`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('➕ Create Another', 'lic_create')],
                    [Markup.button.callback('◀ Back', 'menu_license')]
                ])
            }
        );
    };
    bot.action('lic_tier_full', (ctx) => finishCreateLicense(ctx, 'full'));
    bot.action('lic_tier_chat', (ctx) => finishCreateLicense(ctx, 'chat'));

    // List Licenses by status
    const showLicenseList = async (ctx, filter) => {
        await ctx.answerCbQuery();
        const allLicenses = db.getLicenses();
        const licenses = filter === 'all' ? allLicenses : allLicenses.filter(l => l.status === filter);

        if (licenses.length === 0) {
            return ctx.editMessageText(`📋 Tidak ada license dengan status *${filter}*.`, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([[Markup.button.callback('◀ Back', 'menu_license')]])
            });
        }

        let msg = `📋 *Licenses — ${filter.toUpperCase()}* (${licenses.length})\n\n`;
        const buttons = [];

        licenses.slice(0, 10).forEach((lic, i) => {
            const icon = lic.status === 'unused' ? '🟢' : lic.status === 'used' ? '🔵' : '🔴';
            const tierTag = lic.tier === 'chat' ? '🔵 chat' : '🟢 full';
            const name = escMd(lic.buyer_name || 'Unknown');
            msg += `${i + 1}. ${icon} *${name}* [${tierTag}]\n   \`${lic.key.slice(0, 9)}...\`\n\n`;
            buttons.push([Markup.button.callback(`${icon} ${name} [${tierTag}] — ${lic.key.slice(0, 9)}...`, `lic_detail_${lic.id}`)]);
        });

        buttons.push([Markup.button.callback('◀ Back', 'menu_license')]);
        await ctx.editMessageText(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
    };

    bot.action('lic_list_unused', (ctx) => showLicenseList(ctx, 'unused'));
    bot.action('lic_list_used', (ctx) => showLicenseList(ctx, 'used'));
    bot.action('lic_list_revoked', (ctx) => showLicenseList(ctx, 'revoked'));
    bot.action('lic_list_all', (ctx) => showLicenseList(ctx, 'all'));

    // License Detail — show FULL key
    bot.action(/^lic_detail_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const licId = parseInt(ctx.match[1]);
        const licenses = db.getLicenses();
        const lic = licenses.find(l => l.id === licId);
        if (!lic) return ctx.editMessageText('❌ License not found.');

        const statusIcon = lic.status === 'unused' ? '🟢' : lic.status === 'used' ? '🔵' : '🔴';
        const tierLabel = lic.tier === 'chat' ? '🔵 Chat saja (tanpa web)' : '🟢 Full (Web + Chat)';

        let msg = `🔐 *License Detail*\n\n`;
        msg += `👤 Buyer: *${escMd(lic.buyer_name || '-')}*\n`;
        msg += `🎛 Tier: ${tierLabel}\n`;
        msg += `📊 Status: ${statusIcon} ${lic.status.toUpperCase()}\n`;
        msg += `📅 Created: ${lic.created_at?.slice(0, 10)}\n`;
        msg += `🔑 Key:\n\`${lic.key}\`\n`;

        const buttons = [];
        buttons.push([Markup.button.callback('🔄 Upgrade/Downgrade', `lic_tier_change_${lic.id}`)]);

        // If used, show deployment actions
        if (lic.status === 'used') {
            const dep = db.getDeploymentByLicense(lic.key);
            if (dep) {
                const status = await dockerEngine.getStatus(dep.container_name);
                msg += `\n📦 *Deployment*\n`;
                msg += `🏪 Store: ${escMd(dep.store_name)}\n`;
                msg += `🔌 Port: ${dep.port}\n`;
                msg += `${status.running ? '🟢' : '🔴'} Status: ${status.status}\n`;
                if (status.uptime) msg += `⏱ Uptime: ${formatUptime(status.uptime)}\n`;
                msg += `⏰ Expires: ${daysLeft(dep.expires_at)} hari lagi\n`;
                msg += `🔗 Webhook:\n\`http://${process.env.VPS_IP}:${dep.port}/webhook/qris\`\n`;

                buttons.push([
                    Markup.button.callback('📄 Logs', `dep_logs_${dep.container_name}`),
                    Markup.button.callback('💾 Backup', `dep_backup_${dep.container_name}`)
                ]);
                if (status.running) {
                    buttons.push([
                        Markup.button.callback('🔄 Restart', `dep_restart_${dep.container_name}`),
                        Markup.button.callback('⏹ Stop', `dep_stop_${dep.container_name}`)
                    ]);
                }
            }
            buttons.push([Markup.button.callback('🗑 Revoke License', `lic_revoke_${lic.id}`)]);
        } else if (lic.status === 'unused') {
            buttons.push([Markup.button.callback('🗑 Revoke License', `lic_revoke_${lic.id}`)]);
        }

        buttons.push([Markup.button.callback('◀ Back', 'menu_license')]);
        await ctx.editMessageText(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
    });

    // Upgrade/Downgrade tier
    bot.action(/^lic_tier_change_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const licId = parseInt(ctx.match[1]);
        const lic = db.getLicenseByKey((db.getLicenses().find(l => l.id === licId) || {}).key);
        if (!lic) return ctx.editMessageText('❌ License not found.');

        const current = lic.tier === 'chat' ? '🔵 Chat saja' : '🟢 Full';
        await ctx.editMessageText(
            `🔄 *Ubah Tier License*\n\n` +
            `👤 ${escMd(lic.buyer_name || '-')}\n` +
            `🎛 Sekarang: ${current}\n\n` +
            `Pilih tier baru:`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🟢 Full (Web + Chat)', `lic_tier_set_${licId}_full`)],
                    [Markup.button.callback('🔵 Chat saja (tanpa web)', `lic_tier_set_${licId}_chat`)],
                    [Markup.button.callback('◀ Back', `lic_detail_${licId}`)]
                ])
            }
        );
    });

    // Set tier
    bot.action(/^lic_tier_set_(\d+)_(full|chat)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const licId = parseInt(ctx.match[1]);
        const tier = ctx.match[2];
        const lic = db.getLicenseByKey((db.getLicenses().find(l => l.id === licId) || {}).key);
        if (!lic) return;

        const updated = db.updateLicenseTier(licId, tier);
        const label = updated.tier === 'chat' ? '🔵 Chat saja' : '🟢 Full';

        // Kalau sudah deployed, otomatis rebuild biar env baru berlaku
        let rebuildMsg = '';
        if (lic.status === 'used') {
            const dep = db.getDeploymentByLicense(lic.key);
            if (dep) {
                const r = await dockerEngine.rebuildBot(dep.container_name);
                rebuildMsg = r.success
                    ? `\n\n🔄 Container di-rebuild dengan tier baru (data aman).`
                    : `\n\n⚠️ Gagal rebuild: ${r.error}`;
            }
        }

        await ctx.editMessageText(
            `✅ Tier license diubah ke ${label}${rebuildMsg}`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([[Markup.button.callback('◀ Back', `lic_detail_${licId}`)]])
            }
        );
    });

    // Revoke License
    bot.action(/^lic_revoke_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const licId = parseInt(ctx.match[1]);
        const licenses = db.getLicenses();
        const lic = licenses.find(l => l.id === licId);
        if (!lic) return;

        // Stop container if deployed
        if (lic.status === 'used') {
            const dep = db.getDeploymentByLicense(lic.key);
            if (dep) {
                await dockerEngine.stopBot(dep.container_name);
                db.updateDeploymentStatus(dep.container_name, 'stopped');
            }
        }

        db.revokeLicense(lic.key);
        await ctx.editMessageText(
            `✅ License *${lic.key.slice(0, 9)}...* revoked.\n${lic.status === 'used' ? 'Container telah di-stop.' : ''}`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([[Markup.button.callback('◀ Back', 'menu_license')]])
            }
        );
    });

    // ==================== DEPLOYMENTS ====================

    bot.action('menu_deploy', async (ctx) => {
        await ctx.answerCbQuery();
        const deployments = db.getDeployments();
        const running = deployments.filter(d => d.status === 'running');
        const stopped = deployments.filter(d => d.status !== 'running');

        let msg = `📦 *Deployments* (${running.length}/${deployments.length} running)\n\n`;

        if (deployments.length === 0) {
            msg += '_No deployments yet._';
        } else {
            for (const dep of running.slice(0, MAX_CONTAINERS)) {
                const status = await dockerEngine.getStatus(dep.container_name);
                const upStr = status.uptime ? formatUptime(status.uptime) : '-';
                const expStr = daysLeft(dep.expires_at);
                msg += `🟢 *${escMd(dep.store_name)}* — Port ${dep.port}\n`;
                msg += `   ⏱ ${upStr} | ⏰ ${expStr}d left\n\n`;
            }
            for (const dep of stopped.slice(0, 4)) {
                msg += `🔴 *${escMd(dep.store_name)}* — ${dep.status}\n\n`;
            }
        }

        const buttons = [];
        deployments.slice(0, MAX_CONTAINERS).forEach(dep => {
            const icon = dep.status === 'running' ? '🟢' : '🔴';
            buttons.push([Markup.button.callback(`${icon} ${dep.store_name}`, `dep_detail_${dep.container_name}`)]);
        });
        buttons.push([Markup.button.callback('📥 Import Container', 'dep_import')]);
        buttons.push([Markup.button.callback('◀ Back', 'menu_home')]);

        await ctx.editMessageText(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
    });

    // Deployment Detail
    bot.action(/^dep_detail_(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const containerName = ctx.match[1];
        const dep = db.getDeploymentByContainer(containerName);
        if (!dep) return ctx.editMessageText('❌ Deployment not found.');

        const status = await dockerEngine.getStatus(containerName);

        let msg = `📦 *${escMd(dep.store_name)}*\n\n`;
        msg += `👤 Buyer: ${escMd(dep.buyer_name || '-')}\n`;
        msg += `🔌 Port: ${dep.port}\n`;
        msg += `${status.running ? '🟢' : '🔴'} Status: ${status.status}\n`;
        if (status.uptime) msg += `⏱ Uptime: ${formatUptime(status.uptime)}\n`;
        msg += `⏰ Expires: ${daysLeft(dep.expires_at)} hari lagi\n`;
        msg += `📅 Deployed: ${dep.created_at?.slice(0, 10)}\n`;
        msg += `🔗 Webhook:\n\`http://${process.env.VPS_IP}:${dep.port}/webhook/qris\`\n`;

        const buttons = [
            [
                Markup.button.callback('📄 Logs', `dep_logs_${containerName}`),
                Markup.button.callback('💾 Backup', `dep_backup_${containerName}`)
            ]
        ];
        if (status.running) {
            buttons.push([
                Markup.button.callback('🔄 Restart', `dep_restart_${containerName}`),
                Markup.button.callback('⏹ Stop', `dep_stop_${containerName}`)
            ]);
        } else {
            buttons.push([
                Markup.button.callback('▶️ Start', `dep_start_${containerName}`),
                Markup.button.callback('🗑 Hapus', `dep_del_${containerName}`)
            ]);
        }
        buttons.push([
            Markup.button.callback('🔨 Rebuild', `dep_rebuild_${containerName}`),
            Markup.button.callback('⏰ Timer', `dep_timer_${containerName}`)
        ]);
        buttons.push([Markup.button.callback('◀ Back', 'menu_deploy')]);

        await ctx.editMessageText(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
    });

    // Delete confirmation
    bot.action(/^dep_del_(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const containerName = ctx.match[1];
        const dep = db.getDeploymentByContainer(containerName);

        await ctx.editMessageText(
            `🗑 *Hapus Container?*\n\n🏪 ${escMd(dep?.store_name)}\n📦 ${escMd(containerName)}\n\n⚠️ Container, data, dan record akan dihapus permanen. Lanjut?`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback('✅ Ya, Hapus', `dep_delyes_${containerName}`),
                        Markup.button.callback('❌ Batal', `dep_detail_${containerName}`)
                    ]
                ])
            }
        );
    });

    // Execute delete
    bot.action(/^dep_delyes_(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const containerName = ctx.match[1];
        try {
            await dockerEngine.removeBot(containerName);
        } catch (e) { }
        db.deleteDeployment(containerName);
        await ctx.editMessageText(`✅ *${escMd(containerName)}* berhasil dihapus.`, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.callback('◀ Back', 'menu_deploy')]])
        });
    });

    // Start stopped container
    bot.action(/^dep_start_(.+)$/, async (ctx) => {
        await ctx.answerCbQuery('▶️ Starting...');
        const containerName = ctx.match[1];
        const result = await dockerEngine.startBot(containerName);
        if (result.success) {
            db.updateDeploymentStatus(containerName, 'running');
            await ctx.answerCbQuery('✅ Started!', { show_alert: true });
        } else {
            await ctx.answerCbQuery(`❌ Failed: ${result.error}`, { show_alert: true });
        }
    });

    // Deployment Actions
    bot.action(/^dep_logs_(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const containerName = ctx.match[1];
        const dep = db.getDeploymentByContainer(containerName);
        const logs = await dockerEngine.getLogs(containerName, 25);
        await ctx.reply(
            `📄 *Logs: ${escMd(dep?.store_name || containerName)}*\n\n\`\`\`\n${logs.slice(0, 3500)}\n\`\`\``,
            { parse_mode: 'Markdown' }
        );
    });

    bot.action(/^dep_backup_(.+)$/, async (ctx) => {
        await ctx.answerCbQuery('⏳ Exporting...');
        const containerName = ctx.match[1];
        const dep = db.getDeploymentByContainer(containerName);
        const tarFile = dockerEngine.exportContainer(containerName);

        if (!tarFile) return ctx.reply('❌ Data not found.');

        await ctx.replyWithDocument(
            { source: tarFile, filename: `${dep?.store_name || containerName}_export.tar.gz` },
            { caption: `📦 Export: ${escMd(dep?.store_name)}\n📁 Includes: .env + database + banner\n📅 ${new Date().toISOString().slice(0, 19)}\n\n💡 File ini bisa di-import ke VPS lain.` }
        );
        try { fs.unlinkSync(tarFile); } catch (e) { }
    });

    // Import Container
    bot.action('dep_import', async (ctx) => {
        await ctx.answerCbQuery();
        const running = db.getRunningCount();
        if (running >= MAX_CONTAINERS) {
            return ctx.editMessageText(
                `❌ Max containers reached (${running}/${MAX_CONTAINERS}).\nHapus atau stop container dulu.`,
                { ...Markup.inlineKeyboard([[Markup.button.callback('◀ Back', 'menu_deploy')]]) }
            );
        }

        pendingInput.set(ctx.from.id.toString(), { type: 'import_container' });
        await ctx.editMessageText(
            `📥 *Import Container*\n\n` +
            `Kirim file \`.tar.gz\` yang di-export dari VPS lain.\n\n` +
            `📁 File harus berisi folder container dengan:\n` +
            `  • \`.env\` (config bot)\n` +
            `  • \`db/\` (store.db + files)\n` +
            `  • \`assets/\` (banner.png)\n\n` +
            `⚠️ Port & Webhook URL akan di-generate ulang otomatis.`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'menu_deploy')]])
            }
        );
    });

    // Handle file upload for import
    bot.on('document', async (ctx) => {
        const userId = ctx.from.id.toString();
        if (!adminIds.includes(userId)) return;

        const pending = pendingInput.get(userId);
        if (pending?.type !== 'import_container') return;
        pendingInput.delete(userId);

        const doc = ctx.message.document;
        if (!doc.file_name.endsWith('.tar.gz')) {
            return ctx.reply('❌ File harus berformat .tar.gz', {
                ...Markup.inlineKeyboard([[Markup.button.callback('🔄 Coba Lagi', 'dep_import')]])
            });
        }

        await ctx.reply('⏳ Downloading & importing...');

        try {
            // Download file
            const fileLink = await ctx.telegram.getFileLink(doc.file_id);
            const https = require('https');
            const http = require('http');
            const DATA_DIR = process.env.DATA_DIR || '/root/data';
            const tempPath = path.join(DATA_DIR, `_import_${Date.now()}.tar.gz`);

            await new Promise((resolve, reject) => {
                const proto = fileLink.href.startsWith('https') ? https : http;
                const file = fs.createWriteStream(tempPath);
                proto.get(fileLink.href, (response) => {
                    response.pipe(file);
                    file.on('finish', () => { file.close(); resolve(); });
                }).on('error', reject);
            });

            // Import
            const usedPorts = db.getUsedPorts();
            const result = await dockerEngine.importContainer(tempPath, usedPorts);

            // Cleanup temp file
            try { fs.unlinkSync(tempPath); } catch (e) { }

            if (!result.success) {
                return ctx.reply(`❌ Import failed: ${result.error}`, {
                    ...Markup.inlineKeyboard([[Markup.button.callback('🔄 Coba Lagi', 'dep_import')]])
                });
            }

            // Create deployment record
            db.createImportedDeployment({
                buyer_name: result.buyerName,
                container_name: result.containerName,
                port: result.port,
                store_name: result.storeName,
                bot_token: result.botToken
            });

            await ctx.reply(
                `✅ *Import Berhasil!*\n\n` +
                `🏪 Store: ${escMd(result.storeName)}\n` +
                `📦 Container: \`${result.containerName}\`\n` +
                `🔌 Port: ${result.port}\n` +
                `🔗 Webhook:\n\`${result.webhookUrl}\`\n\n` +
                `⚠️ *Update webhook di PaKasir buyer ke URL baru di atas.*`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('⏰ Set Timer', `dep_timer_${result.containerName}`)],
                        [Markup.button.callback('📋 Lihat Container', `dep_detail_${result.containerName}`)],
                        [Markup.button.callback('◀ Back', 'menu_deploy')]
                    ])
                }
            );
        } catch (err) {
            await ctx.reply(`❌ Import error: ${err.message}`, {
                ...Markup.inlineKeyboard([[Markup.button.callback('🔄 Coba Lagi', 'dep_import')]])
            });
        }
    });

    bot.action(/^dep_restart_(.+)$/, async (ctx) => {
        await ctx.answerCbQuery('🔄 Restarting...');
        const containerName = ctx.match[1];
        const result = await dockerEngine.restartBot(containerName);
        if (result.success) {
            await ctx.answerCbQuery('✅ Restarted!', { show_alert: true });
        } else {
            await ctx.answerCbQuery(`❌ Failed: ${result.error}`, { show_alert: true });
        }
    });

    bot.action(/^dep_stop_(?!confirm_)(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const containerName = ctx.match[1];
        const dep = db.getDeploymentByContainer(containerName);

        await ctx.editMessageText(
            `⚠️ *Stop Container?*\n\n🏪 ${escMd(dep?.store_name)}\n📦 ${escMd(containerName)}\n\nBot buyer akan berhenti. Lanjut?`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback('✅ Ya, Stop', `dep_stopyes_${containerName}`),
                        Markup.button.callback('❌ Batal', `dep_detail_${containerName}`)
                    ]
                ])
            }
        );
    });

    bot.action(/^dep_stopyes_(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const containerName = ctx.match[1];
        await dockerEngine.stopBot(containerName);
        db.updateDeploymentStatus(containerName, 'stopped');
        await ctx.editMessageText(`✅ Container *${escMd(containerName)}* stopped.`, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.callback('◀ Back', 'menu_deploy')]])
        });
    });

    // Rebuild confirmation
    bot.action(/^dep_rebuild_(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const containerName = ctx.match[1];
        const dep = db.getDeploymentByContainer(containerName);

        await ctx.editMessageText(
            `🔨 *Rebuild Container?*\n\n🏪 ${escMd(dep?.store_name)}\n📦 ${escMd(containerName)}\n\n⚠️ Container akan di-rebuild dari image terbaru.\nData (database, assets) tetap aman. Lanjut?`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback('✅ Ya, Rebuild', `dep_rebuildyes_${containerName}`),
                        Markup.button.callback('❌ Batal', `dep_detail_${containerName}`)
                    ]
                ])
            }
        );
    });

    // Execute rebuild
    bot.action(/^dep_rebuildyes_(.+)$/, async (ctx) => {
        await ctx.answerCbQuery('🔨 Rebuilding...');
        const containerName = ctx.match[1];
        const dep = db.getDeploymentByContainer(containerName);

        await ctx.editMessageText(`⏳ Rebuilding *${escMd(dep?.store_name)}*...\nMohon tunggu...`, {
            parse_mode: 'Markdown'
        });

        const result = await dockerEngine.rebuildBot(containerName);

        if (result.success) {
            db.updateDeploymentStatus(containerName, 'running');
            await ctx.editMessageText(
                `✅ *Rebuild Berhasil!*\n\n🏪 ${escMd(dep?.store_name)}\n📦 ${escMd(containerName)}\n🔌 Port: ${result.port}\n\nContainer sudah berjalan dengan image terbaru.`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('📦 Lihat Detail', `dep_detail_${containerName}`)],
                        [Markup.button.callback('◀ Back', 'menu_deploy')]
                    ])
                }
            );
        } else {
            await ctx.editMessageText(
                `❌ *Rebuild Gagal*\n\n📦 ${escMd(containerName)}\n⚠️ Error: ${escMd(result.error)}`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('🔄 Coba Lagi', `dep_rebuild_${containerName}`)],
                        [Markup.button.callback('◀ Back', 'menu_deploy')]
                    ])
                }
            );
        }
    });

    // ==================== TIMER (EXPIRY) ====================

    // Timer view
    bot.action(/^dep_timer_(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const containerName = ctx.match[1];
        const dep = db.getDeploymentByContainer(containerName);
        if (!dep) return;

        const expiresDate = dep.expires_at ? new Date(dep.expires_at) : new Date();
        const daysRemaining = Math.max(0, Math.ceil((expiresDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
        const expiresStr = expiresDate.toISOString().slice(0, 10);

        const msg = `⏰ *Set Expiry — ${escMd(dep.store_name)}*\n\n` +
            `📅 Saat ini: ${expiresStr}\n` +
            `⏳ Sisa: ${daysRemaining} hari lagi\n\n` +
            `Tambah dari tanggal expired:`;

        await ctx.editMessageText(msg, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [
                    Markup.button.callback('+30 hari', `timer_add_30_${containerName}`),
                    Markup.button.callback('+60 hari', `timer_add_60_${containerName}`)
                ],
                [
                    Markup.button.callback('+90 hari', `timer_add_90_${containerName}`),
                    Markup.button.callback('📋 Manual', `timer_manual_${containerName}`)
                ],
                [
                    Markup.button.callback('🎯 Set Hari', `timer_set_${containerName}`)
                ],
                [Markup.button.callback('◀ Back', `dep_detail_${containerName}`)]
            ])
        });
    });

    // Add days preset (+30, +60, +90)
    bot.action(/^timer_add_(\d+)_(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const addDays = parseInt(ctx.match[1]);
        const containerName = ctx.match[2];
        const dep = db.getDeploymentByContainer(containerName);
        if (!dep) return;

        const currentExpiry = dep.expires_at ? new Date(dep.expires_at) : new Date();
        const newExpiry = new Date(currentExpiry.getTime() + addDays * 24 * 60 * 60 * 1000);
        const newExpiryStr = newExpiry.toISOString();

        db.updateExpiresAt(containerName, newExpiryStr);

        const daysRemaining = Math.max(0, Math.ceil((newExpiry.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));

        await ctx.editMessageText(
            `✅ *Expiry Updated!*\n\n` +
            `🏪 ${escMd(dep.store_name)}\n` +
            `📅 Expired baru: ${newExpiry.toISOString().slice(0, 10)}\n` +
            `⏳ Sisa: ${daysRemaining} hari lagi\n\n` +
            `+${addDays} hari ditambahkan dari expired sebelumnya.`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('⏰ Timer', `dep_timer_${containerName}`)],
                    [Markup.button.callback('◀ Back', `dep_detail_${containerName}`)]
                ])
            }
        );
    });

    // Manual input — ask for days
    bot.action(/^timer_manual_(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const containerName = ctx.match[1];
        const dep = db.getDeploymentByContainer(containerName);
        if (!dep) return;

        await ctx.editMessageText(
            `📋 *Manual Timer — ${escMd(dep.store_name)}*\n\n` +
            `Ketik jumlah hari yang mau ditambahkan dari expired saat ini.\n` +
            `Contoh: \`45\` untuk tambah 45 hari.`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', `dep_timer_${containerName}`)]])
            }
        );

        pendingInput.set(ctx.from.id.toString(), { type: 'timer_days', containerName });
    });

    // Set exact days from now
    bot.action(/^timer_set_(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const containerName = ctx.match[1];
        const dep = db.getDeploymentByContainer(containerName);
        if (!dep) return;

        await ctx.editMessageText(
            `🎯 *Set Timer — ${escMd(dep.store_name)}*\n\n` +
            `Ketik jumlah hari *dari sekarang*.\n` +
            `Contoh: \`11\` untuk set sisa 11 hari.\n\n` +
            `⚠️ Ini akan *mengganti* expired, bukan menambah.`,
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', `dep_timer_${containerName}`)]])
            }
        );

        pendingInput.set(ctx.from.id.toString(), { type: 'timer_set_days', containerName });
    });

    // ==================== SYSTEM STATUS ====================

    bot.action('menu_system', async (ctx) => {
        await ctx.answerCbQuery();
        const stats = db.getLicenseStats();
        const running = db.getRunningCount();
        const disk = dockerEngine.getDiskUsage();
        const expiring = db.getExpiringSoon(3);

        let msg = `📊 *System Status*\n\n`;
        msg += `🖥 Server: Online\n`;
        msg += `💿 Disk: ${disk.used} / ${disk.total} (${disk.percent})\n`;
        msg += `🐳 Containers: ${running}/${MAX_CONTAINERS} running\n`;
        msg += `🔑 Licenses: ${stats.unused} unused, ${stats.used} used, ${stats.revoked} revoked\n`;

        if (expiring.length > 0) {
            msg += `\n⏰ *Expiring Soon (3 days):*\n`;
            expiring.forEach(dep => {
                msg += `  • ${escMd(dep.store_name)} — ${daysLeft(dep.expires_at)}d left\n`;
            });
        }

        await ctx.editMessageText(msg, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🔄 Refresh', 'menu_system')],
                [Markup.button.callback('◀ Back', 'menu_home')]
            ])
        });
    });

    // ==================== BACKUP ALL ====================

    bot.action('action_backup_all', async (ctx) => {
        await ctx.answerCbQuery();
        const deployments = db.getDeployments().filter(d => d.status === 'running');
        if (deployments.length === 0) {
            return ctx.editMessageText('📋 No running deployments.', {
                ...Markup.inlineKeyboard([[Markup.button.callback('◀ Back', 'menu_home')]])
            });
        }

        await ctx.editMessageText(`⏳ Backing up ${deployments.length} databases...`, {
            ...Markup.inlineKeyboard([])
        });

        let success = 0, failed = 0;
        for (const dep of deployments) {
            const backupFile = dockerEngine.backupDatabase(dep.container_name);
            if (backupFile) {
                try {
                    await ctx.replyWithDocument(
                        { source: backupFile, filename: `${dep.store_name}_backup.db` },
                        { caption: `💾 ${escMd(dep.store_name)}` }
                    );
                    fs.unlinkSync(backupFile);
                    success++;
                } catch (e) { failed++; }
            } else { failed++; }
        }

        await ctx.reply(`✅ Backup complete! (${success} success, ${failed} failed)`, {
            ...Markup.inlineKeyboard([[Markup.button.callback('🏠 Home', 'menu_home')]])
        });
    });

    // Error handler
    bot.catch((err) => {
        console.error('[LICENSE BOT] Error:', err.message);
    });

    // Start crons
    startExpiryCron(bot, adminIds);
    startAutoBackupCron();

    return bot;
};

const startBot = async () => {
    const b = initBot();
    if (!b) return;

    try {
        await b.launch();
        console.log('🤖 License bot is running!');
    } catch (error) {
        console.error('[LICENSE BOT] Failed to start:', error.message);
    }
};

const stopBotFn = () => {
    if (bot) bot.stop('SIGTERM');
};

module.exports = { initBot, startBot, stopBot: stopBotFn };
