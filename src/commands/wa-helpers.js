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
    const byForm = new Map();    // any id form -> participant
    const phoneByForm = new Map(); // any id form -> phone jid (@s.whatsapp.net)

    for (const p of participants) {
        const isAdm = p.admin === 'admin' || p.admin === 'superadmin';
        const forms = idForms(p);
        const phone = forms.find((f) => f.endsWith('@s.whatsapp.net')) || null;
        for (const form of forms) {
            participantsIds.add(form);
            byForm.set(form, p);
            if (phone) phoneByForm.set(form, phone);
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
        // Map any address (e.g. a @lid mention) to the phone-number jid.
        resolvePhone: (jid) => {
            if (!jid) return jid;
            const n = jidNormalizedUser(jid);
            if (n.endsWith('@s.whatsapp.net')) return n;
            return phoneByForm.get(n) || n;
        },
        // The id WhatsApp expects for group actions (kick/promote/demote).
        resolveActionId: (jid) => {
            if (!jid) return jid;
            const n = jidNormalizedUser(jid);
            const p = byForm.get(n);
            return p?.id ? jidNormalizedUser(p.id) : n;
        },
    };
}

/**
 * Resolve a single address to a phone-number jid using group metadata, with a
 * best-effort fallback to Baileys' LID mapping. Used outside the command flow
 * (e.g. the participants-update listener).
 */
export async function resolvePhoneJid(sock, groupJid, jid) {
    if (!jid) return jid;
    const n = jidNormalizedUser(jid);
    if (n.endsWith('@s.whatsapp.net')) return n;

    try {
        const meta = await sock.groupMetadata(groupJid);
        for (const p of meta.participants || []) {
            const forms = [p.id, p.jid, p.lid, p.phoneNumber].filter(Boolean).map(jidNormalizedUser);
            if (forms.includes(n)) {
                const phone = forms.find((f) => f.endsWith('@s.whatsapp.net'));
                if (phone) return phone;
            }
        }
    } catch { /* ignore */ }

    // Fallback: Baileys LID -> phone-number mapping, if available.
    try {
        const pn = await sock.signalRepository?.lidMapping?.getPNForLID?.(n);
        if (pn) return jidNormalizedUser(pn);
    } catch { /* ignore */ }

    return n;
}
