import { randomBytes } from 'node:crypto';
import { query } from '../pool.js';

/** Map a DB row to the user object used by the app (never exposes password_hash). */
export function toUserDTO(row) {
    if (!row) return null;
    return {
        id: row.id,
        email: row.email,
        name: row.name,
        avatar: row.avatar || null,
        role: row.role,
        hasPassword: Boolean(row.password_hash),
        createdAt: row.created_at,
    };
}

function generateUserId() {
    return `u_${randomBytes(12).toString('hex')}`; // 26 chars
}

/** Internal: fetch full row (incl. password_hash) for auth checks. */
export async function findRawByEmail(email) {
    const rows = await query('SELECT * FROM users WHERE email = ? LIMIT 1', [String(email).toLowerCase()]);
    return rows[0] || null;
}

export async function getById(id) {
    const rows = await query('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
    return toUserDTO(rows[0]);
}

export async function findByEmail(email) {
    return toUserDTO(await findRawByEmail(email));
}

export async function findByGoogleId(googleId) {
    const rows = await query('SELECT * FROM users WHERE google_id = ? LIMIT 1', [googleId]);
    return rows[0] || null;
}

export async function create({ email, name, passwordHash = null, googleId = null, avatar = null, role = 'user' }) {
    const id = generateUserId();
    await query(
        `INSERT INTO users (id, email, name, password_hash, google_id, avatar, role)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, String(email).toLowerCase(), name, passwordHash, googleId, avatar, role],
    );
    return getById(id);
}

/** Link a Google account id (and avatar) to an existing user. */
export async function linkGoogle(id, googleId, avatar = null) {
    await query('UPDATE users SET google_id = ?, avatar = COALESCE(?, avatar) WHERE id = ?', [googleId, avatar, id]);
    return getById(id);
}

export async function countAll() {
    const rows = await query('SELECT COUNT(*) AS total FROM users');
    return Number(rows[0]?.total || 0);
}
