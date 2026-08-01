const db = require('../../db');
const dockerEngine = require('../../docker');
const { escMd, formatUptime, daysLeft, pendingInput } = require('../context');

const VPS_IP = process.env.VPS_IP || 'localhost';

/**
 * Register semua handler deployment & timer ke bot.
 * @param {import('telegraf').Telegraf} bot
 * @param {string[]} adminIds
 */
const registerDeploymentHandlers = (bot, adminIds) => {
    const { Markup } = require('telegraf');
    const path = require('path');
    const fs = require('fs');
    const DATA_DIR = process.env.DATA_DIR || '/root/data';

    // ==================== DEPLOYMENTS ====================

    bot.action('menu_deploy', async (ctx) => {
        await ctx.answerCbQuery();
        const deployments = db.getDeployments();
        const running = deployments.filter(d => d.status === 'running');
        const stopped = deployments.filter(d => d.status !== 'running');
        const MAX_CONTAINERS = parseInt(process.env.MAX_CONTAINERS) || 8;

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
        msg += `🔗 Webhook:\n\`http://${VPS_IP}:${dep.port}/webhook/qris\`\n`;

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
        const MAX_CONTAINERS = parseInt(process.env.MAX_CONTAINERS) || 8;
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
};

module.exports = { registerDeploymentHandlers };
