const db = require('../../db');
const dockerEngine = require('../../docker');
const { escMd, daysLeft } = require('../context');

/**
 * Register handler system status & backup all.
 * @param {import('telegraf').Telegraf} bot
 * @param {string[]} adminIds
 */
const registerSystemHandlers = (bot, adminIds) => {
    const { Markup } = require('telegraf');
    const fs = require('fs');

    // ==================== SYSTEM STATUS ====================

    bot.action('menu_system', async (ctx) => {
        await ctx.answerCbQuery();
        const stats = db.getLicenseStats();
        const running = db.getRunningCount();
        const disk = dockerEngine.getDiskUsage();
        const expiring = db.getExpiringSoon(3);
        const MAX_CONTAINERS = parseInt(process.env.MAX_CONTAINERS) || 8;

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
            // backupDatabase() bisa throw (WAL checkpoint gagal) — jangan sampai
            // 1 container bermasalah membatalkan seluruh batch.
            let backupFile = null;
            try {
                backupFile = dockerEngine.backupDatabase(dep.container_name);
            } catch (e) {
                failed++;
                continue;
            }
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
};

module.exports = { registerSystemHandlers };
