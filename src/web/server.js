import express from 'express';
import http from 'node:http';
import cookieParser from 'cookie-parser';
import { Server } from 'socket.io';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from '../config.js';
import { bus, EVENTS } from '../state/events.js';
import {
    getQr,
    getLogs,
    clearLogs,
    deleteLogs,
    updateSettings,
    notifyConversations,
} from '../state/app-state.js';
import {
    listSessions,
    createSession,
    deleteSession,
    startSession,
    restartSession,
    logoutSession,
    sendMessage,
    renameSession,
    getSessionOwner,
} from '../whatsapp/session-manager.js';
import * as sessionRepo from '../db/repositories/session.repo.js';
import * as conversationRepo from '../db/repositories/conversation.repo.js';
import * as statsRepo from '../db/repositories/stats.repo.js';
import { normalizePhoneToJid } from '../utils/formatter.js';
import {
    attachUser,
    requireAuth,
    requireAuthPage,
    registerAuthRoutes,
    authenticateSocket,
} from './auth.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '../../public');

// Wrap async route handlers so errors are automatically returned as JSON.
const asyncHandler = (fn) => (req, res) => {
    Promise.resolve(fn(req, res)).catch((error) => {
        res.status(400).json({ error: error.message });
    });
};

// Owner scope for the current request: null for superadmin (all bots),
// otherwise restricted to the user's own bots.
const scopeOwner = (req) => (req.user.role === 'superadmin' ? null : req.user.id);

/** Account list + active QR (for REST), optionally scoped to an owner. */
async function sessionsWithQr(ownerId = null) {
    const sessions = await listSessions(ownerId);
    return sessions.map((s) => ({ ...s, qr: getQr(s.id) }));
}

export function startWebServer() {
    const app = express();
    const server = http.createServer(app);
    const io = new Server(server);

    app.use(express.json());
    app.use(cookieParser());
    app.use(attachUser);

    // Public auth endpoints (login/register/logout/me/google/config).
    registerAuthRoutes(app);

    // Login page (public). Redirect to dashboard if already authenticated.
    app.get('/login', (req, res) => {
        if (req.user) {
            res.redirect('/');
            return;
        }
        res.sendFile(path.join(publicDir, 'login.html'));
    });

    // Protected app shell — must be authenticated to load the dashboard.
    app.get(['/', '/index.html'], requireAuthPage, (_req, res) => {
        res.sendFile(path.join(publicDir, 'index.html'));
    });

    // Static assets (JS/CSS/images). index.html is served by the guarded route above.
    app.use(express.static(publicDir, { index: false }));

    // Everything under /api requires authentication.
    app.use('/api', requireAuth);

    // ===== Dashboard (aggregate statistics, scoped to the user) =====

    app.get('/api/dashboard', asyncHandler(async (req, res) => {
        res.json(await statsRepo.dashboard(req.query.days, scopeOwner(req)));
    }));

    // ===== Accounts (sessions) =====

    app.get('/api/sessions', asyncHandler(async (req, res) => {
        res.json(await sessionsWithQr(scopeOwner(req)));
    }));

    app.post('/api/sessions', asyncHandler(async (req, res) => {
        const session = await createSession({ name: req.body.name, ownerId: req.user.id });
        res.status(201).json(session);
    }));

    // Paginated account list + filter (server-side). Must be registered
    // before the '/api/sessions/:id' middleware so it isn't caught as :id.
    app.get('/api/sessions/paginated', asyncHandler(async (req, res) => {
        res.json(await sessionRepo.paginate({
            page: req.query.page,
            pageSize: req.query.pageSize,
            search: String(req.query.search || '').trim(),
            status: String(req.query.status || '').trim(),
            ownerId: scopeOwner(req),
        }));
    }));

    // Middleware: make sure the account exists AND the user is allowed to access it.
    app.use('/api/sessions/:id', (req, res, next) => {
        sessionRepo.get(req.params.id)
            .then((session) => {
                if (!session) {
                    res.status(404).json({ error: 'Account not found.' });
                    return;
                }
                if (req.user.role !== 'superadmin' && session.ownerId !== req.user.id) {
                    res.status(403).json({ error: 'You do not have access to this bot.' });
                    return;
                }
                req.session = session;
                next();
            })
            .catch((error) => res.status(400).json({ error: error.message }));
    });

    // Full snapshot of one account (used when selecting an account in the UI).
    app.get('/api/sessions/:id', asyncHandler(async (req, res) => {
        const { id } = req.params;
        res.json({
            ...req.session,
            qr: getQr(id),
            logs: await getLogs(id),
            conversations: await conversationRepo.listBySession(id),
        });
    }));

    app.delete('/api/sessions/:id', asyncHandler(async (req, res) => {
        await deleteSession(req.params.id);
        res.json({ ok: true });
    }));

    // Rename bot.
    app.patch('/api/sessions/:id', asyncHandler(async (req, res) => {
        res.json(await renameSession(req.params.id, req.body.name));
    }));

    app.post('/api/sessions/:id/start', asyncHandler(async (req, res) => {
        await startSession(req.params.id);
        res.json({ ok: true });
    }));

    app.post('/api/sessions/:id/restart', asyncHandler(async (req, res) => {
        await restartSession(req.params.id);
        res.json({ ok: true });
    }));

    app.post('/api/sessions/:id/logout', asyncHandler(async (req, res) => {
        await logoutSession(req.params.id);
        res.json({ ok: true });
    }));

    app.post('/api/sessions/:id/send-message', asyncHandler(async (req, res) => {
        const jid = normalizePhoneToJid(req.body.phone);
        const text = String(req.body.text || '').trim();
        if (!text) {
            res.status(400).json({ error: 'Message is required.' });
            return;
        }
        await sendMessage(req.params.id, jid, text);
        res.json({ ok: true, jid });
    }));

    // ===== Per-account settings =====

    app.get('/api/sessions/:id/settings', (req, res) => {
        res.json(req.session.settings);
    });

    app.patch('/api/sessions/:id/settings', asyncHandler(async (req, res) => {
        res.json(await updateSettings(req.params.id, req.body));
    }));

    // ===== Per-account logs =====

    app.get('/api/sessions/:id/logs', asyncHandler(async (req, res) => {
        res.json(await getLogs(req.params.id, {
            type: String(req.query.type || '').trim(),
            search: String(req.query.search || '').trim(),
            limit: req.query.limit,
        }));
    }));

    app.delete('/api/sessions/:id/logs', asyncHandler(async (req, res) => {
        res.json({ ok: true, clearedCount: await clearLogs(req.params.id) });
    }));

    app.post('/api/sessions/:id/logs/bulk-delete', asyncHandler(async (req, res) => {
        const { ids } = req.body;
        if (!Array.isArray(ids) || !ids.length) {
            res.status(400).json({ error: 'No IDs selected' });
            return;
        }
        await deleteLogs(req.params.id, ids);
        res.json({ ok: true });
    }));

    // ===== Per-account conversations =====

    app.get('/api/sessions/:id/conversations', asyncHandler(async (req, res) => {
        res.json(await conversationRepo.listBySession(req.params.id));
    }));

    app.delete('/api/sessions/:id/conversations/:jid', asyncHandler(async (req, res) => {
        await conversationRepo.remove(req.params.id, req.params.jid);
        await notifyConversations(req.params.id);
        res.json({ ok: true });
    }));

    // ===== Socket.IO (authenticated + per-user routing) =====

    io.use(async (socket, next) => {
        const user = await authenticateSocket(socket);
        if (!user) {
            next(new Error('unauthorized'));
            return;
        }
        socket.data.user = user;
        next();
    });

    io.on('connection', async (socket) => {
        const user = socket.data.user;
        // Rooms used to route events: each user has their own room; superadmins
        // additionally join a shared room that receives every bot's events.
        socket.join(`user:${user.id}`);
        if (user.role === 'superadmin') socket.join('superadmin');

        try {
            const ownerId = user.role === 'superadmin' ? null : user.id;
            socket.emit(EVENTS.SESSIONS, await sessionsWithQr(ownerId));
        } catch (error) {
            logger.error(error, 'failed to send initial sessions');
        }
        socket.on('disconnect', () => logger.debug({ id: socket.id }, 'Client disconnected'));
    });

    // Send a per-user filtered account list to every connected client.
    function broadcastSessions(list) {
        for (const [, socket] of io.sockets.sockets) {
            const user = socket.data.user;
            if (!user) continue;
            const filtered = user.role === 'superadmin'
                ? list
                : list.filter((s) => s.ownerId === user.id);
            socket.emit(EVENTS.SESSIONS, filtered);
        }
    }

    // Route a per-session event to its owner + all superadmins.
    function emitToOwner(event, payload) {
        const ownerId = getSessionOwner(payload?.sessionId);
        const rooms = ['superadmin'];
        if (ownerId) rooms.push(`user:${ownerId}`);
        io.to(rooms).emit(event, payload);
    }

    // Forward bus events to the right clients.
    for (const event of Object.values(EVENTS)) {
        if (event === EVENTS.SESSIONS) {
            bus.on(event, (list) => broadcastSessions(list));
        } else {
            bus.on(event, (payload) => emitToOwner(event, payload));
        }
    }

    server.listen(config.appPort, () => {
        logger.info(`✅ Console ready: http://localhost:${config.appPort}`);
    });
}
