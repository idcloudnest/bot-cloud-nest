import { query } from '../pool.js';

function toDTO(row) {
    if (!row) return null;
    return {
        jid: row.jid,
        step: row.step,
        data: row.data || {},
        updatedAt: row.updated_at,
    };
}

export async function get(sessionId, jid) {
    const rows = await query(
        'SELECT * FROM conversations WHERE session_id = ? AND jid = ? LIMIT 1',
        [sessionId, jid],
    );
    return toDTO(rows[0]);
}

export async function upsert(sessionId, jid, step, data = {}) {
    await query(
        `INSERT INTO conversations (session_id, jid, step, data)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE step = VALUES(step), data = VALUES(data)`,
        [sessionId, jid, step, JSON.stringify(data || {})],
    );
    return get(sessionId, jid);
}

export async function remove(sessionId, jid) {
    const rows = await query(
        'DELETE FROM conversations WHERE session_id = ? AND jid = ?',
        [sessionId, jid],
    );
    return rows.affectedRows > 0;
}

export async function listBySession(sessionId) {
    const rows = await query(
        'SELECT * FROM conversations WHERE session_id = ? ORDER BY updated_at DESC',
        [sessionId],
    );
    return rows.map(toDTO);
}
