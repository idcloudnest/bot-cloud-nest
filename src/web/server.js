import express from 'express';
import http from 'node:http';
import { Server } from 'socket.io';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import {
    clearLogs,
    getLogs,
    getSettings,
    getState,
    onState,
    updateSettings,
} from '../state/app-state.js';
import { clearSession, getAllSessions } from '../services/session.service.js';
import { logoutWhatsApp, sendWhatsAppMessage, restartWhatsApp, startBot } from '../bot.js';
import { normalizePhoneToJid } from '../utils/formatter.js';
import { basicAuth } from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '../../public');

export function startWebServer() {
    const app = express()
    const server = http.createServer(app)
    const io = new Server(server)

    app.use(express.json())
    app.use(basicAuth)
    app.use(express.static(publicDir))

    app.get('/api/status', (_req, res) => {
        res.json(getState())
    })

    app.get('/api/logs', (_req, res) => {
        res.json(getLogs())
    })

    app.delete('/api/logs', (_req, res) => {
        res.json(clearLogs())
    })

    app.get('/api/settings', (_req, res) => {
        res.json(getSettings())
    })

    app.patch('/api/settings', (req, res) => {
        // const settings = updateSettings({
        //     ignoreGroups: Boolean(req.body.ignoreGroups),
        //     ignorePrivates: Boolean(req.body.ignorePrivates)
        // })

        // res.json(settings)
        res.json(updateSettings(req.body))
    })

    app.get('/api/sessions', (_req, res) => {
        res.json(getAllSessions())
    })

    app.delete('/api/sessions/:jid', (req, res) => {
        clearSession(req.params.jid)
        io.emit('sessions', getAllSessions())
        res.json({ ok: true })
    })

    app.post('/api/send-message', async (req, res) => {
        try {
            const jid = normalizePhoneToJid(req.body.phone)
            const text = String(req.body.text || '').trim()

            if (!text) {
                res.status(400).json({ error: 'Pesan wajib diisi.' })
                return
            }

            await sendWhatsAppMessage(jid, text)
            res.json({ ok: true, jid })
        } catch (error) {
            res.status(400).json({ error: error.message })
        }
    })

    app.post('/api/logout', async (_req, res) => {
        try {
            await logoutWhatsApp()
            res.json({ ok: true })
        } catch (error) {
            res.status(400).json({ error: error.message })
        }
    })

    app.post('/api/restart', async (_req, res) => {
        try {
            await restartWhatsApp();
            res.json({ ok: true });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    });

    app.post('/api/generate-qr', async (_req, res) => {
        try {
            await startBot(); // Panggil fungsi utama Baileys
            res.json({ ok: true });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    });

    io.on('connection', (socket) => {
        console.log('Client connected:', socket.id);

        const currentState = getState();

        socket.emit('state', currentState);
        socket.emit('status', currentState.status);
        socket.emit('settings', currentState.settings);
        socket.emit('logs:init', getLogs());
        socket.emit('sessions', getAllSessions());

        if (currentState.qr) {
            socket.emit('qr', currentState.qr);
        }

        socket.on('disconnect', () => {
            console.log('Client disconnected:', socket.id);
        });
    })

    onState('status', (payload) => {
        io.emit('status', payload);
        io.emit('state', getState());
    });

    onState('qr', (payload) => {
        io.emit('qr', payload);
        io.emit('state', getState());
    });

    onState('settings', (payload) => io.emit('settings', payload))

    // ===== LOGS SETTINGS =====
    onState('log', (payload) => {
        io.emit('log', payload)
        // io.emit('state', getState());
        io.emit('sessions', getAllSessions())
    })
    onState('logs:init', (payload) => {
        io.emit('logs:init', payload)
    })
    onState('logs:clear', (payload) => {
        io.emit('logs:clear', payload)
    })
    // ===== LOGS SETTINGS =====

    server.listen(config.appPort, () => {
        console.log(`✅ Console ready: http://localhost:${config.appPort}`)
    })
}
