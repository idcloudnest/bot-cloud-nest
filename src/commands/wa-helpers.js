import { jidNormalizedUser } from '@whiskeysockets/baileys';

// Helpers for extracting sender/mention/admin info from a Baileys message.

/** The bot's own bare jid (without device suffix). */
export function botJid(sock) {
    return sock?.user?.id ? jidNormalizedUser(sock.user.id) : null;
}

/**
 * All identifiers that represent the bot itself. Baileys v7 groups use the
 * new "@lid" addressing, so the bot can appear in a group as its phone jid
 * AND/OR its lid — we must match against both.
 */
export function botIds(sock) {
    const user = sock?.user || {};
    const ids = [];
    if (user.id) ids.push(jidNormalizedUser(user.id));
    if (user.lid) ids.push(jidNormalizedUser(user.lid));
    return ids;
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
 * Group metadata + derived admin info. Each participant may be addressed by a
 * phone jid and/or a lid (Baileys v7), so we index every available form.
 * Returns: { meta, admins:Set, participantsIds:Set, isBotAdmin, isAdmin(jid) }.
 */
export async function getGroupContext(sock, groupJid) {
    const meta = await sock.groupMetadata(groupJid);
    const participants = meta.participants || [];

    // All id forms a participant might be known by.
    const idForms = (p) => [p.id, p.jid, p.lid, p.phoneNumber].filter(Boolean).map(jidNormalizedUser);

    const admins = new Set();
    const participantsIds = new Set();
    for (const p of participants) {
        const isAdm = p.admin === 'admin' || p.admin === 'superadmin';
        for (const form of idForms(p)) {
            participantsIds.add(form);
            if (isAdm) admins.add(form);
        }
    }

    const botForms = botIds(sock);
    const isBotAdmin = botForms.some((id) => admins.has(id));

    return {
        meta,
        admins,
        participantsIds,
        botIds: botForms,
        isBotAdmin,
        isAdmin: (jid) => (jid ? admins.has(jidNormalizedUser(jid)) : false),
    };
}
