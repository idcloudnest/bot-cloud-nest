import { query } from '../pool.js';

// Menyimpan auth state Baileys (creds + signal keys) sebagai pasangan key/value
// string per akun. Serialisasi value memakai BufferJSON dilakukan di auth-state.js.

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

/** Hapus seluruh auth state akun (dipakai saat logout / QR expired). */
export async function clear(sessionId) {
    await query('DELETE FROM auth_state WHERE session_id = ?', [sessionId]);
}

/** Cek apakah akun punya creds tersimpan (untuk auto-resume saat startup). */
export async function hasCreds(sessionId) {
    const rows = await query(
        "SELECT 1 FROM auth_state WHERE session_id = ? AND data_key = 'creds' LIMIT 1",
        [sessionId],
    );
    return rows.length > 0;
}
