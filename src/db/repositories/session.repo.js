import { query } from '../pool.js';
import { config } from '../../config.js';

// Default feature flags for a bot (modular on/off per account).
export const DEFAULT_FEATURES = { store: true, group: true };

/** Normalize a stored features value (JSON column) into a complete flags object. */
function normalizeFeatures(raw) {
    const f = raw && typeof raw === 'object' ? raw : {};
    return {
        store: f.store !== undefined ? Boolean(f.store) : DEFAULT_FEATURES.store,
        group: f.group !== undefined ? Boolean(f.group) : DEFAULT_FEATURES.group,
    };
}

/** Convert a DB row into the status shape used by the app/frontend. */
export function toSessionDTO(row) {
    if (!row) return null;
    return {
        id: row.id,
        name: row.name,
        ownerId: row.owner_id || null,
        owner: row.owner_id
            ? { id: row.owner_id, name: row.owner_name || null, email: row.owner_email || null }
            : null,
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
            features: normalizeFeatures(row.features),
        },
    };
}

export async function list(ownerId = null) {
    const base = `SELECT s.*, u.name AS owner_name, u.email AS owner_email
                  FROM sessions s LEFT JOIN users u ON u.id = s.owner_id`;
    if (ownerId) {
        const rows = await query(`${base} WHERE s.owner_id = ? ORDER BY s.created_at ASC`, [ownerId]);
        return rows.map(toSessionDTO);
    }
    const rows = await query(`${base} ORDER BY s.created_at ASC`);
    return rows.map(toSessionDTO);
}

/**
 * List accounts with pagination + filter (server-side).
 * @param {{ page?: number, pageSize?: number, search?: string, status?: string, ownerId?: string|null }} opts
 *   status: 'connected' | connection column value (idle, qr, open, close, logged_out, error, ...).
 *   ownerId: scope to a single owner; null/undefined = all (superadmin).
 */
export async function paginate({ page = 1, pageSize = 10, search = '', status = '', ownerId = null } = {}) {
    const where = [];
    const params = [];

    if (ownerId) {
        where.push('s.owner_id = ?');
        params.push(ownerId);
    }
    if (search) {
        where.push('(s.id LIKE ? OR s.name LIKE ?)');
        params.push(`%${search}%`, `%${search}%`);
    }
    if (status) {
        if (status === 'connected') {
            where.push('s.connected = 1');
        } else {
            where.push('s.connection = ?');
            params.push(status);
        }
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countRows = await query(`SELECT COUNT(*) AS total FROM sessions s ${whereSql}`, params);
    const total = Number(countRows[0]?.total || 0);

    // LIMIT/OFFSET inlined as a sanitized integer (LIMIT placeholders
    // are not reliable in mysql2 prepared statements).
    const safePageSize = Math.min(Math.max(Number(pageSize) || 10, 1), 100);
    const totalPages = Math.max(Math.ceil(total / safePageSize), 1);
    const safePage = Math.min(Math.max(Number(page) || 1, 1), totalPages);
    const offset = (safePage - 1) * safePageSize;

    const rows = await query(
        `SELECT s.*, u.name AS owner_name, u.email AS owner_email
         FROM sessions s LEFT JOIN users u ON u.id = s.owner_id
         ${whereSql} ORDER BY s.created_at DESC LIMIT ${safePageSize} OFFSET ${offset}`,
        params,
    );

    return {
        data: rows.map(toSessionDTO),
        pagination: { page: safePage, pageSize: safePageSize, total, totalPages },
    };
}

export async function get(id) {
    const rows = await query(
        `SELECT s.*, u.name AS owner_name, u.email AS owner_email
         FROM sessions s LEFT JOIN users u ON u.id = s.owner_id
         WHERE s.id = ? LIMIT 1`,
        [id],
    );
    return toSessionDTO(rows[0]);
}

export async function exists(id) {
    const rows = await query('SELECT 1 FROM sessions WHERE id = ? LIMIT 1', [id]);
    return rows.length > 0;
}

export async function create({ id, name, ownerId = null }) {
    await query(
        `INSERT INTO sessions (id, name, owner_id, connection, connected, message, ignore_groups, ignore_privates, log_limit, features)
         VALUES (?, ?, ?, 'idle', 0, 'Bot standby. Click Generate QR to start.', ?, ?, ?, ?)`,
        [id, name, ownerId, config.ignoreGroups ? 1 : 0, config.ignorePrivates ? 1 : 0, config.logLimit, JSON.stringify(DEFAULT_FEATURES)],
    );
    return get(id);
}

/** Assign all unowned bots to a user (used when seeding the first superadmin). */
export async function assignOwnerWhereNull(ownerId) {
    const rows = await query('UPDATE sessions SET owner_id = ? WHERE owner_id IS NULL', [ownerId]);
    return rows.affectedRows || 0;
}

/** Return only the owner_id of a session (lightweight, for socket routing). */
export async function getOwnerId(id) {
    const rows = await query('SELECT owner_id FROM sessions WHERE id = ? LIMIT 1', [id]);
    return rows[0]?.owner_id || null;
}

/** Update the account display name (rename bot). */
export async function updateName(id, name) {
    await query('UPDATE sessions SET name = ? WHERE id = ?', [name, id]);
    return get(id);
}

export async function updateStatus(id, status = {}) {    const fields = [];
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

    if (settings.features !== undefined) {
        // Merge the patch onto the current features so partial updates are safe.
        const current = await get(id);
        const merged = normalizeFeatures({ ...(current?.settings.features || {}), ...settings.features });
        fields.push('features = ?');
        values.push(JSON.stringify(merged));
    }

    if (!fields.length) return get(id);

    values.push(id);
    await query(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`, values);
    return get(id);
}

export async function remove(id) {
    await query('DELETE FROM sessions WHERE id = ?', [id]);
}
