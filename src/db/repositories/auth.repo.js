import { query } from '../pool.js';

// Stores Baileys auth state (creds + signal keys) as string key/value pairs
// per account. Value serialization using BufferJSON is done in auth-state.js.

export async function getValue(sessionId, key) {
    const rows = await query(
        'SELECT data_value FROM auth_state WHERE session_id = ? AND data_key = ? LIMIT 1',
        [sessionId, key],
    );
    return rows[0]?.data_value ?? null;
}

export async function setValue(sessionId, key, value) {
    await query(
        `INSERT INTO auth_state (session_id, data_key, data_value)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE data_value = VALUES(data_value)`,
        [sessionId, key, value],
    );
}

export async function removeValue(sessionId, key) {
    await query('DELETE FROM auth_state WHERE session_id = ? AND data_key = ?', [sessionId, key]);
}

/** Delete all auth state for an account (used on logout / QR expired). */
export async function clear(sessionId) {
    await query('DELETE FROM auth_state WHERE session_id = ?', [sessionId]);
}

/** Check whether an account has stored creds (for auto-resume at startup). */
export async function hasCreds(sessionId) {
    const rows = await query(
        "SELECT 1 FROM auth_state WHERE session_id = ? AND data_key = 'creds' LIMIT 1",
        [sessionId],
    );
    return rows.length > 0;
}
