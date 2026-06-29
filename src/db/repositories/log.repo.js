import { randomBytes } from 'node:crypto';
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

/**
 * Generate a log id: time prefix (hex, sortable) + random.
 * Time-sortable -> chronological order stays correct without AUTO_INCREMENT.
 * 28 hex chars long; collision probability is practically zero.
 */
function generateLogId() {
    const time = Date.now().toString(16).padStart(12, '0'); // 12 hex, sortable
    const rand = randomBytes(8).toString('hex'); // 16 hex
    return time + rand;
}

/** Ensure the limit value is safe to inline into SQL (LIMIT param is problematic in prepared stmt). */
function safeLimit(value, fallback = 100) {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return Math.min(Math.max(n, 1), 5000);
}

export async function add(sessionId, type, payload = {}, jid = null) {
    const id = generateLogId();
    await query(
        'INSERT INTO logs (id, session_id, type, jid, payload) VALUES (?, ?, ?, ?, ?)',
        [id, sessionId, type, jid, JSON.stringify(payload || {})],
    );
    const inserted = await query('SELECT * FROM logs WHERE id = ? LIMIT 1', [id]);
    return toDTO(inserted[0]);
}

export async function list(sessionId, limit = 100) {
    const rows = await query(
        `SELECT * FROM logs WHERE session_id = ? ORDER BY created_at DESC, id DESC LIMIT ${safeLimit(limit)}`,
        [sessionId],
    );
    return rows.map(toDTO);
}

/** List logs with type filter + text search (text payload / jid / type). */
export async function search(sessionId, { type = '', search = '', limit = 100 } = {}) {
    const where = ['session_id = ?'];
    const params = [sessionId];

    if (type) {
        where.push('type = ?');
        params.push(type);
    }
    if (search) {
        where.push(`(
            JSON_UNQUOTE(JSON_EXTRACT(payload, '$.text')) LIKE ?
            OR jid LIKE ?
            OR type LIKE ?
        )`);
        const like = `%${search}%`;
        params.push(like, like, like);
    }

    const rows = await query(
        `SELECT * FROM logs WHERE ${where.join(' AND ')}
         ORDER BY created_at DESC, id DESC
         LIMIT ${safeLimit(limit)}`,
        params,
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

/** Remove old logs that exceed the limit (keep the latest N). */
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
