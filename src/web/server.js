import express from 'express';
import http from 'node:http';
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
} from '../whatsapp/session-manager.js';
import * as sessionRepo from '../db/repositories/session.repo.js';
import * as conversationRepo from '../db/repositories/conversation.repo.js';
import * as statsRepo from '../db/repositories/stats.repo.js';
import { normalizePhoneToJid } from '../utils/formatter.js';
import { basicAuth } from './auth.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '../../public');

// Bungkus async route handler agar error otomatis dikirim sebagai JSON.
const asyncHandler = (fn) => (req, res) => {
    Promise.resolve(fn(req, res)).catch((error) => {
        res.status(400).json({ error: error.message });
    });
};

/** Daftar akun + QR aktif (untuk REST, tanpa emit event). */
async function sessionsWithQr() {
    const sessions = await listSessions();
    return sessions.map((s) => ({ ...s, qr: getQr(s.id) }));
}

export function startWebServer() {
    const app = express();
    const server = http.createServer(app);
    const io = new Server(server);

    app.use(express.json());
    app.use(basicAuth);
    app.use(express.static(publicDir));

    // ===== Dashboard (statistik agregat) =====

    app.get('/api/dashboard', asyncHandler(async (req, res) => {
        res.json(await statsRepo.dashboard(req.query.days));
    }));

    // ===== Akun (sessions) =====

    app.get('/api/sessions', asyncHandler(async (_req, res) => {
        res.json(await sessionsWithQr());
    }));

    app.post('/api/sessions', asyncHandler(async (req, res) => {
        const session = await createSession({ id: req.body.id, name: req.body.name });
        res.status(201).json(session);
    }));

    // Daftar akun ber-pagination + filter (server-side). Harus didaftarkan
    // sebelum middleware '/api/sessions/:id' agar tidak tertangkap sebagai :id.
    app.get('/api/sessions/paginated', asyncHandler(async (req, res) => {
        res.json(await sessionRepo.paginate({
            page: req.query.page,
            pageSize: req.query.pageSize,
            search: String(req.query.search || '').trim(),
            status: String(req.query.status || '').trim(),
        }));
    }));

    // Middleware: pastikan akun ada untuk route ber-:id.
    app.use('/api/sessions/:id', (req, res, next) => {
        sessionRepo.get(req.params.id)
            .then((session) => {
                if (!session) {
                    res.status(404).json({ error: 'Akun tidak ditemukan.' });
                    return;
                }
                req.session = session;
                next();
            })
            .catch((error) => res.status(400).json({ error: error.message }));
    });

    // Snapshot lengkap satu akun (dipakai saat memilih akun di UI).
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
            res.status(400).json({ error: 'Pesan wajib diisi.' });
            return;
        }
        await sendMessage(req.params.id, jid, text);
        res.json({ ok: true, jid });
    }));

    // ===== Settings per akun =====

    app.get('/api/sessions/:id/settings', (req, res) => {
        res.json(req.session.settings);
    });

    app.patch('/api/sessions/:id/settings', asyncHandler(async (req, res) => {
        res.json(await updateSettings(req.params.id, req.body));
    }));

    // ===== Logs per akun =====

    app.get('/api/sessions/:id/logs', asyncHandler(async (req, res) => {
        res.json(await getLogs(req.params.id));
    }));

    app.delete('/api/sessions/:id/logs', asyncHandler(async (req, res) => {
        res.json({ ok: true, clearedCount: await clearLogs(req.params.id) });
    }));

    app.post('/api/sessions/:id/logs/bulk-delete', asyncHandler(async (req, res) => {
        const { ids } = req.body;
        if (!Array.isArray(ids) || !ids.length) {
            res.status(400).json({ error: 'Tidak ada ID yang dipilih' });
            return;
        }
        await deleteLogs(req.params.id, ids);
        res.json({ ok: true });
    }));

    // ===== Conversations per akun =====

    app.get('/api/sessions/:id/conversations', asyncHandler(async (req, res) => {
        res.json(await conversationRepo.listBySession(req.params.id));
    }));

    app.delete('/api/sessions/:id/conversations/:jid', asyncHandler(async (req, res) => {
        await conversationRepo.remove(req.params.id, req.params.jid);
        await notifyConversations(req.params.id);
        res.json({ ok: true });
    }));

    // ===== Socket.IO =====

    io.on('connection', async (socket) => {
        try {
            socket.emit(EVENTS.SESSIONS, await sessionsWithQr());
        } catch (error) {
            logger.error(error, 'failed to send initial sessions');
        }
        socket.on('disconnect', () => logger.debug({ id: socket.id }, 'Client disconnected'));
    });

    // Teruskan semua event bus ke client (payload sudah membawa sessionId).
    for (const event of Object.values(EVENTS)) {
        bus.on(event, (payload) => io.emit(event, payload));
    }

    server.listen(config.appPort, () => {
        logger.info(`✅ Console ready: http://localhost:${config.appPort}`);
    });
}
