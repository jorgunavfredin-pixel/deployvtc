const db = require('../../db');
const dockerEngine = require('../../docker');
const { escMd, formatUptime, daysLeft, pendingInput } = require('../context');

const VPS_IP = process.env.VPS_IP || 'localhost';

/**
 * Register semua handler license ke bot.
 * @param {import('telegraf').Telegraf} bot
 * @param {string[]} adminIds
 */
const registerLicenseHandlers = (bot, adminIds) => {
    const { Markup } = require('telegraf');

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
            `🌐 ${/^\d/.test(VPS_IP) ? 'http://' + VPS_IP + ':' + (process.env.PORT || '800') : 'https://' + VPS_IP}/\n` +
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
                msg += `🔗 Webhook:\n\`http://${VPS_IP}:${dep.port}/webhook/qris\`\n`;

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
};

module.exports = { registerLicenseHandlers };
