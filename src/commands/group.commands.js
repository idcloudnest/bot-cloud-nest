import { config } from '../config.js';
import * as groupRepo from '../db/repositories/group.repo.js';
import { addLog } from '../state/app-state.js';
import { logger } from '../utils/logger.js';
import { mentionTag } from './wa-helpers.js';

// Group moderation commands. Each command runs only when the bot's `group`
// feature is enabled (gated by the dispatcher) and inside a group chat.

const WARN_LIMIT = config.warnLimit;

/** Log without ever throwing (a logging failure must not break an action). */
async function safeLog(sessionId, type, payload, jid) {
    try {
        await addLog(sessionId, type, payload, jid);
    } catch (error) {
        logger.error(error, 'group command addLog failed');
    }
}

/** Build a reply that mentions the given jids. */
function withMentions(text, jids = []) {
    return { text, mentions: jids };
}

/** Targets that are safe to act on (not the bot, not group admins). */
function actionableTargets(ctx) {
    const targets = ctx.targets.filter((t) => t !== ctx.botJid);
    return targets;
}

const kick = {
    name: 'kick',
    feature: 'group',
    groupOnly: true,
    adminOnly: true,
    botAdmin: true,
    usage: '.kick @user',
    desc: 'Keluarkan member dari grup',
    async handler(ctx) {
        const targets = actionableTargets(ctx);
        if (!targets.length) return 'Tag atau balas pesan member yang mau dikeluarkan.\nContoh: *.kick @user*';

        const safe = targets.filter((t) => !ctx.group.isAdmin(t));
        if (!safe.length) return 'Tidak bisa mengeluarkan admin grup 🙏';

        await ctx.sock.groupParticipantsUpdate(ctx.jid, safe, 'remove');
        await safeLog(ctx.sessionId, 'system', { text: `Kicked ${safe.join(', ')} from ${ctx.jid}` }, ctx.jid);
        return withMentions(`✅ ${safe.map(mentionTag).join(', ')} dikeluarkan dari grup.`, safe);
    },
};

const promote = {
    name: 'promote',
    feature: 'group',
    groupOnly: true,
    adminOnly: true,
    botAdmin: true,
    usage: '.promote @user',
    desc: 'Jadikan member sebagai admin',
    async handler(ctx) {
        const targets = actionableTargets(ctx);
        if (!targets.length) return 'Tag member yang mau dijadikan admin.\nContoh: *.promote @user*';

        const toPromote = targets.filter((t) => !ctx.group.isAdmin(t));
        if (!toPromote.length) return 'Member tersebut sudah admin.';

        await ctx.sock.groupParticipantsUpdate(ctx.jid, toPromote, 'promote');
        return withMentions(`⭐ ${toPromote.map(mentionTag).join(', ')} sekarang admin.`, toPromote);
    },
};

const demote = {
    name: 'demote',
    feature: 'group',
    groupOnly: true,
    adminOnly: true,
    botAdmin: true,
    usage: '.demote @user',
    desc: 'Turunkan admin jadi member biasa',
    async handler(ctx) {
        const targets = actionableTargets(ctx);
        if (!targets.length) return 'Tag admin yang mau diturunkan.\nContoh: *.demote @user*';

        const toDemote = targets.filter((t) => ctx.group.isAdmin(t));
        if (!toDemote.length) return 'Member tersebut bukan admin.';

        await ctx.sock.groupParticipantsUpdate(ctx.jid, toDemote, 'demote');
        return withMentions(`↘️ ${toDemote.map(mentionTag).join(', ')} diturunkan jadi member.`, toDemote);
    },
};

const warn = {
    name: 'warn',
    feature: 'group',
    groupOnly: true,
    adminOnly: true,
    botAdmin: true,
    usage: '.warn @user [alasan]',
    desc: `Beri peringatan (otomatis kick di peringatan ke-${WARN_LIMIT})`,
    async handler(ctx) {
        const targets = actionableTargets(ctx);
        if (!targets.length) return 'Tag member yang mau diperingatkan.\nContoh: *.warn @user spam*';
        if (targets.some((t) => ctx.group.isAdmin(t))) return 'Tidak bisa memberi peringatan ke admin 🙏';

        const target = targets[0];
        const reason = ctx.args.filter((a) => !a.startsWith('@')).join(' ').trim() || null;

        const count = await groupRepo.addWarning(ctx.sessionId, ctx.jid, target, reason);

        if (count >= WARN_LIMIT) {
            await groupRepo.addBlacklist(ctx.sessionId, ctx.jid, target, reason || `Mencapai ${WARN_LIMIT} peringatan`);
            await groupRepo.resetWarning(ctx.sessionId, ctx.jid, target);
            try {
                await ctx.sock.groupParticipantsUpdate(ctx.jid, [target], 'remove');
            } catch { /* maybe already left */ }
            await safeLog(ctx.sessionId, 'system', { text: `Auto-kick (warn limit) ${target} in ${ctx.jid}` }, ctx.jid);
            return withMentions(
                `🚫 ${mentionTag(target)} mencapai *${WARN_LIMIT}/${WARN_LIMIT}* peringatan.\n` +
                `Dikeluarkan dan masuk daftar blokir grup ini. Jika join lagi akan otomatis dikeluarkan.`,
                [target],
            );
        }

        const reasonLine = reason ? `\nAlasan: _${reason}_` : '';
        return withMentions(
            `⚠️ Peringatan *${count}/${WARN_LIMIT}* untuk ${mentionTag(target)}.${reasonLine}\n` +
            `Di peringatan ke-${WARN_LIMIT} akan otomatis dikeluarkan.`,
            [target],
        );
    },
};

const unwarn = {
    name: 'unwarn',
    feature: 'group',
    groupOnly: true,
    adminOnly: true,
    usage: '.unwarn @user',
    desc: 'Hapus semua peringatan member',
    async handler(ctx) {
        const targets = actionableTargets(ctx);
        if (!targets.length) return 'Tag member yang peringatannya mau dihapus.\nContoh: *.unwarn @user*';

        const target = targets[0];
        const had = await groupRepo.resetWarning(ctx.sessionId, ctx.jid, target);
        return withMentions(
            had ? `✅ Peringatan ${mentionTag(target)} sudah direset.` : `${mentionTag(target)} tidak punya peringatan.`,
            [target],
        );
    },
};

const warns = {
    name: 'warns',
    aliases: ['cekwarn', 'checkwarn'],
    feature: 'group',
    groupOnly: true,
    usage: '.warns @user',
    desc: 'Cek jumlah peringatan member',
    async handler(ctx) {
        const target = ctx.targets[0] || ctx.sender;
        const count = await groupRepo.getWarning(ctx.sessionId, ctx.jid, target);
        return withMentions(`ℹ️ ${mentionTag(target)} punya *${count}/${WARN_LIMIT}* peringatan.`, [target]);
    },
};

const unblacklist = {
    name: 'unbl',
    aliases: ['unblacklist'],
    feature: 'group',
    groupOnly: true,
    adminOnly: true,
    usage: '.unbl @user',
    desc: 'Hapus member dari daftar blokir grup',
    async handler(ctx) {
        const targets = ctx.targets;
        if (!targets.length) return 'Tag member yang mau dilepas dari daftar blokir.\nContoh: *.unbl @user*';
        const target = targets[0];
        const removed = await groupRepo.removeBlacklist(ctx.sessionId, ctx.jid, target);
        return withMentions(
            removed ? `✅ ${mentionTag(target)} dilepas dari daftar blokir.` : `${mentionTag(target)} tidak ada di daftar blokir.`,
            [target],
        );
    },
};

export const groupCommands = [kick, promote, demote, warn, unwarn, warns, unblacklist];

/**
 * Auto-moderation on group membership changes: kick blacklisted users that
 * (re)join. Called by the session manager for every 'group-participants.update'.
 */
export async function handleParticipantsUpdate(sessionId, sock, update, { groupEnabled }) {
    if (!groupEnabled) return;
    if (update.action !== 'add') return;

    const groupJid = update.id;
    const joined = update.participants || [];

    for (const userJid of joined) {
        try {
            if (await groupRepo.isBlacklisted(sessionId, groupJid, userJid)) {
                await sock.groupParticipantsUpdate(groupJid, [userJid], 'remove');
                await safeLog(sessionId, 'system', { text: `Auto-kicked blacklisted ${userJid} on rejoin in ${groupJid}` }, groupJid);
                await sock.sendMessage(groupJid, {
                    text: `🚫 ${mentionTag(userJid)} ada di daftar blokir grup ini dan otomatis dikeluarkan.`,
                    mentions: [userJid],
                });
            }
        } catch {
            // Bot may not be admin or the user already left — ignore.
        }
    }
}
