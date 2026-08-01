const { Telegraf, Markup } = require('telegraf');
const db = require('../db');
const { pendingInput, escMd } = require('./context');
const { registerLicenseHandlers } = require('./handlers/license');
const { registerDeploymentHandlers } = require('./handlers/deployment');
const { registerSystemHandlers } = require('./handlers/system');
const { startExpiryCron, startAutoBackupCron } = require('../cron');

let bot = null;

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

        let msg = `🔐 *Vitacimin Deploy — Admin Panel*\n\n`;
        msg += `📦 Active: *${running}/${MAX_CONTAINERS}* containers\n`;
        msg += `🔑 Licenses: *${stats.total}* total (*${stats.unused}* unused)\n`;
        const expiring = db.getExpiringSoon(3);
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

    // ==================== TEXT INPUT HANDLER ====================

    bot.on('text', async (ctx) => {
        const userId = ctx.from.id.toString();
        const pending = pendingInput.get(userId);

        // Handle buyer name input
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
                `Ketik \`full\` atau \`chat\`:\n\n` +
                `Atau klik tombol di bawah:`,
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

        // Handle license tier text input
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

    // ==================== REGISTER HANDLERS ====================

    registerLicenseHandlers(bot, adminIds);
    registerDeploymentHandlers(bot, adminIds);
    registerSystemHandlers(bot, adminIds);

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
