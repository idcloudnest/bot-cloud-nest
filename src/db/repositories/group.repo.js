import { query } from '../pool.js';

// Group moderation state: warning counters + blacklist, scoped per
// (account, group, user).

// --- Warnings ---

export async function getWarning(sessionId, groupJid, userJid) {
    const rows = await query(
        'SELECT count FROM group_warnings WHERE session_id = ? AND group_jid = ? AND user_jid = ? LIMIT 1',
        [sessionId, groupJid, userJid],
    );
    return Number(rows[0]?.count || 0);
}

/** Increment the warning counter by 1 and return the new total. */
export async function addWarning(sessionId, groupJid, userJid, reason = null) {
    await query(
        `INSERT INTO group_warnings (session_id, group_jid, user_jid, count, reason)
         VALUES (?, ?, ?, 1, ?)
         ON DUPLICATE KEY UPDATE count = count + 1, reason = VALUES(reason)`,
        [sessionId, groupJid, userJid, reason],
    );
    return getWarning(sessionId, groupJid, userJid);
}

export async function resetWarning(sessionId, groupJid, userJid) {
    const rows = await query(
        'DELETE FROM group_warnings WHERE session_id = ? AND group_jid = ? AND user_jid = ?',
        [sessionId, groupJid, userJid],
    );
    return rows.affectedRows > 0;
}

// --- Blacklist ---

export async function addBlacklist(sessionId, groupJid, userJid, reason = null) {
    await query(
        `INSERT INTO group_blacklist (session_id, group_jid, user_jid, reason)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE reason = VALUES(reason)`,
        [sessionId, groupJid, userJid, reason],
    );
}

export async function isBlacklisted(sessionId, groupJid, userJid) {
    const rows = await query(
        'SELECT 1 FROM group_blacklist WHERE session_id = ? AND group_jid = ? AND user_jid = ? LIMIT 1',
        [sessionId, groupJid, userJid],
    );
    return rows.length > 0;
}

export async function removeBlacklist(sessionId, groupJid, userJid) {
    const rows = await query(
        'DELETE FROM group_blacklist WHERE session_id = ? AND group_jid = ? AND user_jid = ?',
        [sessionId, groupJid, userJid],
    );
    return rows.affectedRows > 0;
}
