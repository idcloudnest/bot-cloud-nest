import { query } from '../pool.js';

function toDTO(row) {
    return {
        id: String(row.id),
        type: row.type,
        jid: row.jid,
        payload: row.payload || {},
        timestamp: row.created_at,
    };
}

/** Pastikan nilai limit aman untuk di-inline ke SQL (LIMIT param bermasalah di prepared stmt). */
function safeLimit(value, fallback = 100) {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return Math.min(Math.max(n, 1), 5000);
}

export async function add(sessionId, type, payload = {}, jid = null) {
    const rows = await query(
        'INSERT INTO logs (session_id, type, jid, payload) VALUES (?, ?, ?, ?)',
        [sessionId, type, jid, JSON.stringify(payload || {})],
    );
    const inserted = await query('SELECT * FROM logs WHERE id = ? LIMIT 1', [rows.insertId]);
    return toDTO(inserted[0]);
}

export async function list(sessionId, limit = 100) {
    const rows = await query(
        `SELECT * FROM logs WHERE session_id = ? ORDER BY created_at DESC, id DESC LIMIT ${safeLimit(limit)}`,
        [sessionId],
    );
    return rows.map(toDTO);
}

export async function clear(sessionId) {
    const rows = await query('DELETE FROM logs WHERE session_id = ?', [sessionId]);
    return rows.affectedRows || 0;
}

export async function bulkDelete(sessionId, ids = []) {
    if (!ids.length) return 0;
    const placeholders = ids.map(() => '?').join(', ');
    const rows = await query(
        `DELETE FROM logs WHERE session_id = ? AND id IN (${placeholders})`,
        [sessionId, ...ids],
    );
    return rows.affectedRows || 0;
}

/** Buang log lama yang melebihi batas (keep N terbaru). */
export async function trim(sessionId, limit = 100) {
    await query(
        `DELETE FROM logs
         WHERE session_id = ?
           AND id NOT IN (
               SELECT id FROM (
                   SELECT id FROM logs WHERE session_id = ?
                   ORDER BY created_at DESC, id DESC
                   LIMIT ${safeLimit(limit)}
               ) keep
           )`,
        [sessionId, sessionId],
    );
}
