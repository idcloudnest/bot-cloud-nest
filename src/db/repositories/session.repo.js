import { query } from '../pool.js';
import { config } from '../../config.js';

/** Ubah row DB jadi bentuk status yang dipakai aplikasi/frontend. */
export function toSessionDTO(row) {
    if (!row) return null;
    return {
        id: row.id,
        name: row.name,
        status: {
            connection: row.connection,
            connected: Boolean(row.connected),
            message: row.message,
            lastError: row.last_error,
            device: row.device || null,
            startedAt: row.created_at,
            updatedAt: row.updated_at,
        },
        settings: {
            ignoreGroups: Boolean(row.ignore_groups),
            ignorePrivates: Boolean(row.ignore_privates),
            logLimit: row.log_limit,
        },
    };
}

export async function list() {
    const rows = await query('SELECT * FROM sessions ORDER BY created_at ASC');
    return rows.map(toSessionDTO);
}

/**
 * Daftar akun dengan pagination + filter (server-side).
 * @param {{ page?: number, pageSize?: number, search?: string, status?: string }} opts
 *   status: 'connected' | nilai kolom connection (idle, qr, open, close, logged_out, error, ...).
 */
export async function paginate({ page = 1, pageSize = 10, search = '', status = '' } = {}) {
    const where = [];
    const params = [];

    if (search) {
        where.push('(id LIKE ? OR name LIKE ?)');
        params.push(`%${search}%`, `%${search}%`);
    }
    if (status) {
        if (status === 'connected') {
            where.push('connected = 1');
        } else {
            where.push('connection = ?');
            params.push(status);
        }
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countRows = await query(`SELECT COUNT(*) AS total FROM sessions ${whereSql}`, params);
    const total = Number(countRows[0]?.total || 0);

    // LIMIT/OFFSET di-inline sebagai integer hasil sanitasi (placeholder LIMIT
    // tidak reliabel di prepared statement mysql2).
    const safePageSize = Math.min(Math.max(Number(pageSize) || 10, 1), 100);
    const totalPages = Math.max(Math.ceil(total / safePageSize), 1);
    const safePage = Math.min(Math.max(Number(page) || 1, 1), totalPages);
    const offset = (safePage - 1) * safePageSize;

    const rows = await query(
        `SELECT * FROM sessions ${whereSql} ORDER BY created_at DESC LIMIT ${safePageSize} OFFSET ${offset}`,
        params,
    );

    return {
        data: rows.map(toSessionDTO),
        pagination: { page: safePage, pageSize: safePageSize, total, totalPages },
    };
}

export async function get(id) {
    const rows = await query('SELECT * FROM sessions WHERE id = ? LIMIT 1', [id]);
    return toSessionDTO(rows[0]);
}

export async function exists(id) {
    const rows = await query('SELECT 1 FROM sessions WHERE id = ? LIMIT 1', [id]);
    return rows.length > 0;
}

export async function create({ id, name }) {
    await query(
        `INSERT INTO sessions (id, name, connection, connected, message, ignore_groups, ignore_privates, log_limit)
         VALUES (?, ?, 'idle', 0, 'Bot standby. Silakan klik Generate QR.', ?, ?, ?)`,
        [id, name, config.ignoreGroups ? 1 : 0, config.ignorePrivates ? 1 : 0, config.logLimit],
    );
    return get(id);
}

export async function updateStatus(id, status = {}) {
    const fields = [];
    const values = [];

    if (status.connection !== undefined) { fields.push('connection = ?'); values.push(status.connection); }
    if (status.connected !== undefined) { fields.push('connected = ?'); values.push(status.connected ? 1 : 0); }
    if (status.message !== undefined) { fields.push('message = ?'); values.push(status.message); }
    if (status.lastError !== undefined) { fields.push('last_error = ?'); values.push(status.lastError); }
    if (status.device !== undefined) { fields.push('device = ?'); values.push(status.device ? JSON.stringify(status.device) : null); }

    if (!fields.length) return;

    values.push(id);
    await query(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`, values);
}

export async function updateSettings(id, settings = {}) {
    const fields = [];
    const values = [];

    if (settings.ignoreGroups !== undefined) { fields.push('ignore_groups = ?'); values.push(settings.ignoreGroups ? 1 : 0); }
    if (settings.ignorePrivates !== undefined) { fields.push('ignore_privates = ?'); values.push(settings.ignorePrivates ? 1 : 0); }
    if (settings.logLimit !== undefined) { fields.push('log_limit = ?'); values.push(settings.logLimit); }

    if (!fields.length) return get(id);

    values.push(id);
    await query(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`, values);
    return get(id);
}

export async function remove(id) {
    await query('DELETE FROM sessions WHERE id = ?', [id]);
}
