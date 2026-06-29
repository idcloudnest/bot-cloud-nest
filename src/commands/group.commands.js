import { config } from '../config.js';
import * as groupRepo from '../db/repositories/group.repo.js';
import { addLog } from '../state/app-state.js';
import { logger } from '../utils/logger.js';
import { mentionTag, resolvePhoneJid, getGroupContext } from './wa-helpers.js';

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

/** Only the digits of a string ("+62 812-3456" -> "62812345"). */
function digitsOf(s) {
    return String(s || '').replace(/\D/g, '');
}

/** Normalize a number/jid to a comparable form (leading 0 -> 62). */
function canonicalNumber(s) {
    let d = digitsOf(String(s).split('@')[0]);
    if (d.startsWith('0')) d = `62${d.slice(1)}`;
    return d;
}

/** Render the group blacklist as a numbered list of phone numbers + reason. */
function blacklistText(listed = []) {
    let text = `╭─── ୨୧ *DAFTAR BLOKIR* ୨୧\n│\n│  ${listed.length} member diblokir\n│`;
    listed.forEach((b, idx) => {
        const num = digitsOf(b.userJid.split('@')[0]);
        const n = String(idx + 1).padStart(2, '0');
        text += `\n│ ${n}. +${num}`;
        if (b.reason) text += `\n│     _${b.reason}_`;
    });
    text += `\n│\n╰─── ⋆｡˚ Cloud Nest Bot ⋆｡˚`;
    return text;
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

        const actionIds = safe.map((t) => ctx.group?.resolveActionId(t) || t);
        await ctx.sock.groupParticipantsUpdate(ctx.jid, actionIds, 'remove');
        await safeLog(ctx.sessionId, 'system', { text: `Kicked ${actionIds.join(', ')} from ${ctx.jid}` }, ctx.jid);
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

        const target = targets[0];                                  // for mention highlight
        const phone = ctx.group?.resolvePhone(target) || target;    // stored/keyed by phone jid
        const actionId = ctx.group?.resolveActionId(target) || target;
        const reason = ctx.args.filter((a) => !a.startsWith('@')).join(' ').trim() || null;

        const count = await groupRepo.addWarning(ctx.sessionId, ctx.jid, phone, reason);

        if (count >= WARN_LIMIT) {
            await groupRepo.addBlacklist(ctx.sessionId, ctx.jid, phone, reason || `Mencapai ${WARN_LIMIT} peringatan`);
            await groupRepo.resetWarning(ctx.sessionId, ctx.jid, phone);
            try {
                await ctx.sock.groupParticipantsUpdate(ctx.jid, [actionId], 'remove');
            } catch { /* maybe already left */ }
            await safeLog(ctx.sessionId, 'system', { text: `Auto-kick (warn limit) ${phone} in ${ctx.jid}` }, ctx.jid);
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
        const phone = ctx.group?.resolvePhone(target) || target;
        const had = await groupRepo.resetWarning(ctx.sessionId, ctx.jid, phone);
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
        const phone = ctx.group?.resolvePhone(target) || target;
        const count = await groupRepo.getWarning(ctx.sessionId, ctx.jid, phone);
        return withMentions(`ℹ️ ${mentionTag(target)} punya *${count}/${WARN_LIMIT}* peringatan.`, [target]);
    },
};

const unblacklist = {
    name: 'unbl',
    aliases: ['unblacklist'],
    feature: 'group',
    groupOnly: true,
    adminOnly: true,
    usage: '.unbl <nomor / @user>',
    desc: 'Lepas member dari daftar blokir grup',
    async handler(ctx) {
        const listed = await groupRepo.listBlacklist(ctx.sessionId, ctx.jid);

        // Resolve the target: a mention/reply, otherwise a typed phone number.
        let targetJid = ctx.targets[0] || null;

        if (!targetJid) {
            const numArg = ctx.args.find((a) => digitsOf(a).length >= 5);
            if (!numArg) {
                // No target given -> show the blacklist so the admin can pick a number.
                return listed.length
                    ? `${blacklistText(listed)}\n\nLepas blokir: *.unbl <nomor>*\nContoh: *.unbl 6281234567890*`
                    : 'Daftar blokir grup ini kosong ✅';
            }
            const typed = canonicalNumber(numArg);
            const match = listed.find((b) => canonicalNumber(b.userJid) === typed);
            if (!match) {
                return `Nomor *${digitsOf(numArg)}* tidak ada di daftar blokir.\n\n${listed.length ? blacklistText(listed) : ''}`.trim();
            }
            targetJid = match.userJid;
        }

        const removed = await groupRepo.removeBlacklist(ctx.sessionId, ctx.jid, targetJid);
        await groupRepo.resetWarning(ctx.sessionId, ctx.jid, targetJid);
        const num = digitsOf(targetJid.split('@')[0]);
        return removed
            ? `✅ Nomor *${num}* dilepas dari daftar blokir. Sekarang bisa join grup lagi.`
            : `Nomor *${num}* tidak ada di daftar blokir.`;
    },
};

const blacklist = {
    name: 'bl',
    aliases: ['blacklist', 'daftarblokir'],
    feature: 'group',
    groupOnly: true,
    adminOnly: true,
    usage: '.bl',
    desc: 'Lihat daftar member yang diblokir',
    async handler(ctx) {
        const listed = await groupRepo.listBlacklist(ctx.sessionId, ctx.jid);
        if (!listed.length) return 'Daftar blokir grup ini kosong ✅';
        return `${blacklistText(listed)}\n\nLepas blokir: *.unbl <nomor>*`;
    },
};

export const groupCommands = [kick, promote, demote, warn, unwarn, warns, blacklist, unblacklist];

/**
 * Auto-moderation on group membership changes: kick blacklisted users that
 * (re)join. Called by the session manager for every 'group-participants.update'.
 */
export async function handleParticipantsUpdate(sessionId, sock, update, { groupEnabled }) {
    logger.info({ sessionId, action: update?.action, id: update?.id, participants: update?.participants, groupEnabled },
        'group-participants.update received');

    if (!groupEnabled) return;
    if (update.action !== 'add') return;

    const groupJid = update.id;
    const joined = update.participants || [];
    if (!joined.length) return;

    let group;
    let listed;
    try {
        group = await getGroupContext(sock, groupJid);
        listed = await groupRepo.listBlacklist(sessionId, groupJid);
    } catch (error) {
        logger.error(error, 'rejoin check: failed to load group/blacklist');
        return;
    }

    // Compare by canonical phone number so lid/jid differences don't matter.
    const blockedNumbers = new Map(listed.map((b) => [canonicalNumber(b.userJid), b]));

    for (const userJid of joined) {
        try {
            const phone = group.resolvePhone(userJid) || await resolvePhoneJid(sock, groupJid, userJid);
            const candidates = [userJid, phone].filter(Boolean);
            const numbers = candidates.map(canonicalNumber);
            const matched = numbers.some((n) => blockedNumbers.has(n));

            logger.info({ userJid, phone, numbers, blocked: [...blockedNumbers.keys()], matched },
                'rejoin blacklist check');

            if (!matched) continue;

            const actionId = group.resolveActionId(userJid) || userJid;
            await sock.groupParticipantsUpdate(groupJid, [actionId], 'remove');
            await safeLog(sessionId, 'system', { text: `Auto-kicked blacklisted ${phone} on rejoin in ${groupJid}` }, groupJid);
            await sock.sendMessage(groupJid, {
                text: `🚫 ${mentionTag(phone)} ada di daftar blokir grup ini dan otomatis dikeluarkan.`,
                mentions: [userJid],
            });
        } catch (error) {
            logger.error({ err: error, userJid }, 'rejoin auto-kick failed');
        }
    }
}
