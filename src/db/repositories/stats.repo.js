import { query } from '../pool.js';

/** Clamp an integer value so it's safe to inline into SQL. */
function clampInt(value, min, max, fallback) {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(Math.max(n, min), max);
}

/** List of dates (UTC) for the last `days` days, format YYYY-MM-DD, ascending order. */
function lastDays(days) {
    const out = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i -= 1) {
        const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
        out.push(d.toISOString().slice(0, 10));
    }
    return out;
}

// Ownership scoping: when ownerId is set, restrict to that owner's bots.
// Returns a SQL fragment (prefixed with " AND ...") plus the params to append.
function logsOwnerScope(ownerId) {
    if (!ownerId) return { sql: '', params: [] };
    return { sql: ' AND session_id IN (SELECT id FROM sessions WHERE owner_id = ?)', params: [ownerId] };
}

/** Summary cards (the big numbers at the top of the dashboard). */
export async function summary(ownerId = null) {
    const sessionWhere = ownerId ? 'WHERE owner_id = ?' : '';
    const sessionParams = ownerId ? [ownerId] : [];
    const [sessions] = await query(
        `SELECT COUNT(*) AS total, SUM(connected = 1) AS connected FROM sessions ${sessionWhere}`,
        sessionParams,
    );

    const logScope = logsOwnerScope(ownerId);
    const [today] = await query(
        `SELECT
            SUM(type IN ('incoming', 'outgoing')) AS messages,
            SUM(type = 'incoming') AS incoming,
            SUM(type = 'outgoing') AS outgoing,
            SUM(type = 'error') AS errors
         FROM logs
         WHERE DATE(created_at) = UTC_DATE()${logScope.sql}`,
        logScope.params,
    );

    const convScope = logsOwnerScope(ownerId);
    const [conv] = await query(
        `SELECT COUNT(*) AS total FROM conversations WHERE 1=1${convScope.sql}`,
        convScope.params,
    );

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

/** Daily time-series per log type for the last `days` days (continuous, fill 0 for empty days). */
export async function dailySeries(days = 14, ownerId = null) {
    const n = clampInt(days, 1, 90, 14);
    const scope = logsOwnerScope(ownerId);
    const rows = await query(
        `SELECT
            DATE_FORMAT(created_at, '%Y-%m-%d') AS d,
            SUM(type = 'incoming') AS incoming,
            SUM(type = 'outgoing') AS outgoing,
            SUM(type = 'system')   AS \`system\`,
            SUM(type = 'error')    AS \`error\`
         FROM logs
         WHERE created_at >= (UTC_DATE() - INTERVAL ${n - 1} DAY)${scope.sql}
         GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')`,
        scope.params,
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

/** Log distribution per type for the last `days` days (for the donut chart). */
export async function logTypeBreakdown(days = 14, ownerId = null) {
    const n = clampInt(days, 1, 90, 14);
    const scope = logsOwnerScope(ownerId);
    const rows = await query(
        `SELECT type, COUNT(*) AS total
         FROM logs
         WHERE created_at >= (UTC_DATE() - INTERVAL ${n - 1} DAY)${scope.sql}
         GROUP BY type
         ORDER BY total DESC`,
        scope.params,
    );
    return rows.map((r) => ({ type: r.type, total: Number(r.total || 0) }));
}

/** Accounts with the most message traffic in the last `days` days. */
export async function topAccounts(days = 14, limit = 5, ownerId = null) {
    const n = clampInt(days, 1, 90, 14);
    const lim = clampInt(limit, 1, 20, 5);
    const ownerWhere = ownerId ? 'WHERE s.owner_id = ?' : '';
    const params = ownerId ? [ownerId] : [];
    const rows = await query(
        `SELECT s.id, s.name, COUNT(l.id) AS total
         FROM sessions s
         LEFT JOIN logs l
            ON l.session_id = s.id
           AND l.type IN ('incoming', 'outgoing')
           AND l.created_at >= (UTC_DATE() - INTERVAL ${n - 1} DAY)
         ${ownerWhere}
         GROUP BY s.id, s.name
         ORDER BY total DESC, s.created_at ASC
         LIMIT ${lim}`,
        params,
    );
    return rows.map((r) => ({ id: r.id, name: r.name, total: Number(r.total || 0) }));
}

/** All dashboard data at once. Scoped to `ownerId` unless null (superadmin = all). */
export async function dashboard(days = 14, ownerId = null) {
    const [sum, series, breakdown, top] = await Promise.all([
        summary(ownerId),
        dailySeries(days, ownerId),
        logTypeBreakdown(days, ownerId),
        topAccounts(days, 5, ownerId),
    ]);
    return { days: clampInt(days, 1, 90, 14), summary: sum, series, breakdown, topAccounts: top };
}
