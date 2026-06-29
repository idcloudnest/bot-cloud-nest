import { jidNormalizedUser } from '@whiskeysockets/baileys';

// Helpers for extracting sender/mention/admin info from a Baileys message.

/** The bot's own bare jid (without device suffix). */
export function botJid(sock) {
    return sock?.user?.id ? jidNormalizedUser(sock.user.id) : null;
}

/** Actual sender jid: msg.key.participant in groups, remoteJid otherwise. */
export function senderJid(msg) {
    const raw = msg.key.participant || msg.key.remoteJid;
    return raw ? jidNormalizedUser(raw) : null;
}

/** contextInfo of the message (carries mentions + quoted info). */
function contextInfo(msg) {
    const m = msg.message || {};
    return (
        m.extendedTextMessage?.contextInfo ||
        m.imageMessage?.contextInfo ||
        m.videoMessage?.contextInfo ||
        null
    );
}

/**
 * Resolve the target user jid(s) of a command:
 * mentioned users first, otherwise the author of a quoted/replied message.
 */
export function targetJids(msg) {
    const ctx = contextInfo(msg);
    const mentioned = (ctx?.mentionedJid || []).map(jidNormalizedUser);
    if (mentioned.length) return mentioned;

    const quotedAuthor = ctx?.participant ? jidNormalizedUser(ctx.participant) : null;
    return quotedAuthor ? [quotedAuthor] : [];
}

/** "@628xxxx" tag for a jid (used so the recipient gets a real mention). */
export function mentionTag(jid) {
    return `@${String(jid).split('@')[0]}`;
}

/**
 * Group metadata + derived admin info. Returns:
 * { meta, admins:Set, isAdmin(jid), participantsIds:Set }.
 */
export async function getGroupContext(sock, groupJid) {
    const meta = await sock.groupMetadata(groupJid);
    const admins = new Set(
        (meta.participants || [])
            .filter((p) => p.admin === 'admin' || p.admin === 'superadmin')
            .map((p) => jidNormalizedUser(p.id)),
    );
    const participantsIds = new Set((meta.participants || []).map((p) => jidNormalizedUser(p.id)));
    return {
        meta,
        admins,
        participantsIds,
        isAdmin: (jid) => admins.has(jidNormalizedUser(jid)),
    };
}
