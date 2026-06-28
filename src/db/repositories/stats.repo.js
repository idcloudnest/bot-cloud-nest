import { query } from '../pool.js';

/** Batasi nilai integer agar aman di-inline ke SQL. */
function clampInt(value, min, max, fallback) {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(Math.max(n, min), max);
}

/** Daftar tanggal (UTC) terakhir `days` hari, format YYYY-MM-DD, urut menaik. */
function lastDays(days) {
    const out = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i -= 1) {
        const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
        out.push(d.toISOString().slice(0, 10));
    }
    return out;
}

/** Kartu ringkasan (angka besar di atas dashboard). */
export async function summary() {
    const [sessions] = await query(
        `SELECT
            COUNT(*) AS total,
            SUM(connected = 1) AS connected
         FROM sessions`,
    );
    const [today] = await query(
        `SELECT
            SUM(type IN ('incoming', 'outgoing')) AS messages,
            SUM(type = 'incoming') AS incoming,
            SUM(type = 'outgoing') AS outgoing,
            SUM(type = 'error') AS errors
         FROM logs
         WHERE DATE(created_at) = UTC_DATE()`,
    );
    const [conv] = await query('SELECT COUNT(*) AS total FROM conversations');

    return {
        totalAccounts: Number(sessions.total || 0),
        connectedAccounts: Number(sessions.connected || 0),
        messagesToday: Number(today.messages || 0),
        incomingToday: Number(today.incoming || 0),
        outgoingToday: Number(today.outgoing || 0),
        errorsToday: Number(today.errors || 0),
        activeConversations: Number(conv.total || 0),
    };
}

/** Time-series harian per tipe log untuk `days` hari terakhir (continuous, isi 0 utk hari kosong). */
export async function dailySeries(days = 14) {
    const n = clampInt(days, 1, 90, 14);
    const rows = await query(
        `SELECT
            DATE_FORMAT(created_at, '%Y-%m-%d') AS d,
            SUM(type = 'incoming') AS incoming,
            SUM(type = 'outgoing') AS outgoing,
            SUM(type = 'system')   AS \`system\`,
            SUM(type = 'error')    AS \`error\`
         FROM logs
         WHERE created_at >= (UTC_DATE() - INTERVAL ${n - 1} DAY)
         GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')`,
    );

    const map = new Map(rows.map((r) => [r.d, r]));
    return lastDays(n).map((date) => {
        const r = map.get(date) || {};
        return {
            date,
            incoming: Number(r.incoming || 0),
            outgoing: Number(r.outgoing || 0),
            system: Number(r.system || 0),
            error: Number(r.error || 0),
        };
    });
}

/** Distribusi log per tipe untuk `days` hari terakhir (untuk donut chart). */
export async function logTypeBreakdown(days = 14) {
    const n = clampInt(days, 1, 90, 14);
    const rows = await query(
        `SELECT type, COUNT(*) AS total
         FROM logs
         WHERE created_at >= (UTC_DATE() - INTERVAL ${n - 1} DAY)
         GROUP BY type
         ORDER BY total DESC`,
    );
    return rows.map((r) => ({ type: r.type, total: Number(r.total || 0) }));
}

/** Akun dengan trafik pesan terbanyak dalam `days` hari terakhir. */
export async function topAccounts(days = 14, limit = 5) {
    const n = clampInt(days, 1, 90, 14);
    const lim = clampInt(limit, 1, 20, 5);
    const rows = await query(
        `SELECT s.id, s.name, COUNT(l.id) AS total
         FROM sessions s
         LEFT JOIN logs l
            ON l.session_id = s.id
           AND l.type IN ('incoming', 'outgoing')
           AND l.created_at >= (UTC_DATE() - INTERVAL ${n - 1} DAY)
         GROUP BY s.id, s.name
         ORDER BY total DESC, s.created_at ASC
         LIMIT ${lim}`,
    );
    return rows.map((r) => ({ id: r.id, name: r.name, total: Number(r.total || 0) }));
}

/** Semua data dashboard sekaligus. */
export async function dashboard(days = 14) {
    const [sum, series, breakdown, top] = await Promise.all([
        summary(),
        dailySeries(days),
        logTypeBreakdown(days),
        topAccounts(days),
    ]);
    return { days: clampInt(days, 1, 90, 14), summary: sum, series, breakdown, topAccounts: top };
}
