import makeWASocket, { DisconnectReason } from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';

import { handleMessage } from '../handlers/message.handler.js';
import { useMySQLAuthState } from './auth-state.js';
import {
    addLog,
    setQr,
    setStatus,
    setLogLimit,
    dropRuntime,
    emitSessionsList,
} from '../state/app-state.js';
import * as sessionRepo from '../db/repositories/session.repo.js';
import * as authRepo from '../db/repositories/auth.repo.js';
import { logger } from '../utils/logger.js';

const QR_TIMEOUT_MS = 60_000;
const RECONNECT_DELAY_MS = 2_000;
const RESTART_DELAY_MS = 300;
const SESSION_ID_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/;

// State koneksi hidup per akun: { sock, isStarting, clearAuth, + flag per-attempt }.
const connections = new Map();

function conn(sessionId) {
    if (!connections.has(sessionId)) {
        connections.set(sessionId, { sock: null, isStarting: false, clearAuth: null });
    }
    return connections.get(sessionId);
}

export function getSocket(sessionId) {
    return connections.get(sessionId)?.sock || null;
}

export function listSessions() {
    return sessionRepo.list();
}

// --- Lifecycle ---

export async function createSession({ id, name }) {
    const cleanId = String(id || '').trim().toLowerCase();
    if (!SESSION_ID_RE.test(cleanId)) {
        throw new Error('ID akun tidak valid. Gunakan huruf kecil/angka/-/_ (2-64 karakter).');
    }
    if (await sessionRepo.exists(cleanId)) {
        throw new Error(`Akun "${cleanId}" sudah ada.`);
    }

    const session = await sessionRepo.create({ id: cleanId, name: String(name || cleanId).trim() });
    setLogLimit(cleanId, session.settings.logLimit);
    await emitSessionsList();
    return session;
}

export async function startSession(sessionId) {
    const session = await sessionRepo.get(sessionId);
    if (!session) throw new Error(`Akun "${sessionId}" tidak ditemukan.`);

    const c = conn(sessionId);
    if (c.isStarting) return c.sock;
    c.isStarting = true;

    setLogLimit(sessionId, session.settings.logLimit);

    // Flag per-attempt koneksi.
    let isConnectedYet = false;
    let qrExpireAt = null;
    let forceKillTimeout = null;
    let isTimeoutReached = false;

    try {
        await setStatus(sessionId, { connection: 'starting', connected: false, message: 'Starting bot...' });

        const { state, saveCreds, clearAuth } = await useMySQLAuthState(sessionId);
        c.clearAuth = clearAuth;

        const sock = makeWASocket({
            auth: state,
            logger: pino({ level: 'silent' }),
            markOnlineOnConnect: false,
            printQRInTerminal: false,
            browser: ['Cloud Nest Bot', 'Chrome', '1.0.0'],
            qrTimeout: QR_TIMEOUT_MS,
        });
        c.sock = sock;

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            logger.debug({ sessionId, connection, hasQr: Boolean(qr) }, 'connection.update');

            if (qr) await handleQrUpdate(qr);
            if (connection === 'connecting') {
                await setStatus(sessionId, { connection: 'connecting', connected: false, message: 'Connecting to WhatsApp...' });
            }
            if (connection === 'open') await handleConnectionOpen();
            if (connection === 'close') await handleConnectionClose(lastDisconnect);
        });

        sock.ev.on('messages.upsert', async ({ messages }) => {
            for (const message of messages) {
                await handleMessage(sessionId, sock, message);
            }
        });

        return sock;
    } catch (error) {
        c.sock = null;
        await setStatus(sessionId, { connection: 'error', connected: false, message: 'Bot failed to start', lastError: error.message });
        throw error;
    } finally {
        c.isStarting = false;
    }

    // --- Handler internal (closure atas flag per-attempt) ---

    async function handleQrUpdate(qr) {
        // Sudah lewat batas waktu: jangan tampilkan QR baru (mencegah QR "muncul
        // lagi" setelah timer di UI habis). Langsung hentikan sesi.
        if (qrExpireAt && Date.now() >= qrExpireAt) {
            if (!isConnectedYet && c.sock) {
                isTimeoutReached = true;
                c.sock.ws.close();
            }
            return;
        }

        if (!qrExpireAt) {
            qrExpireAt = Date.now() + QR_TIMEOUT_MS;
            await addLog(sessionId, 'system', { text: '📱 QR Code berhasil di-generate. Silakan scan melalui WhatsApp.' });

            forceKillTimeout = setTimeout(() => {
                if (!isConnectedYet && c.sock) {
                    isTimeoutReached = true;
                    c.sock.ws.close();
                }
            }, QR_TIMEOUT_MS + 500);
        }

        const qrDataUrl = await QRCode.toDataURL(qr);
        setQr(sessionId, { qr, qrDataUrl, expireAt: qrExpireAt, updatedAt: new Date().toISOString() });
        await setStatus(sessionId, { connection: 'qr', connected: false, message: 'Waiting for QR scan' });
    }

    async function handleConnectionOpen() {
        isConnectedYet = true;
        setQr(sessionId, null);
        if (forceKillTimeout) clearTimeout(forceKillTimeout);

        const sock = c.sock;
        const device = {
            id: sock?.user?.id || null,
            name: sock?.user?.name || null,
            platform: sock?.user?.platform || 'WhatsApp',
            connectedAt: new Date().toISOString(),
        };

        await setStatus(sessionId, {
            connection: 'connected',
            connected: true,
            message: 'WhatsApp connected',
            device,
            lastError: null,
        });
        await addLog(sessionId, 'system', { text: `✅ WhatsApp bot connected as ${device.name || 'Unknown'}.` });
    }

    async function handleConnectionClose(lastDisconnect) {
        const hadActiveQr = Boolean(qrExpireAt); // QR sempat ditampilkan pada attempt ini
        qrExpireAt = null;
        if (forceKillTimeout) clearTimeout(forceKillTimeout);

        const statusCode =
            lastDisconnect?.error?.output?.statusCode ||
            lastDisconnect?.error?.statusCode ||
            500;
        const errorMessage = lastDisconnect?.error?.message || `Closed with status ${statusCode}`;

        c.sock = null;
        setQr(sessionId, null);

        // 515: dikirim WhatsApp tepat setelah QR berhasil di-scan (pairing selesai).
        // Normal — socket WAJIB di-restart untuk membuka sesi yang terautentikasi.
        const isRestartRequired = statusCode === DisconnectReason.restartRequired; // 515
        // QR ditampilkan tapi tidak pernah konek -> QR tidak di-scan / kedaluwarsa.
        // Mencakup loggedOut/timedOut/408/force-kill: semua berarti QR expired di sini.
        const isQrExpired = !isRestartRequired && !isConnectedYet && (hadActiveQr || isTimeoutReached);
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        const shouldReconnect = !isRestartRequired && !isQrExpired && !isLoggedOut;

        if (isRestartRequired) {
            await setStatus(sessionId, { connection: 'connecting', connected: false, message: 'QR ter-scan, menyelesaikan login...' });
            await addLog(sessionId, 'system', { text: '🔄 QR berhasil di-scan. Menyambungkan sesi...' });
            setTimeout(() => startSession(sessionId).catch((e) => logger.error(e, 'restart after pairing failed')), RESTART_DELAY_MS);
        } else if (isQrExpired) {
            await setStatus(sessionId, { connection: 'idle', connected: false, message: 'QR Code Kadaluarsa', lastError: errorMessage });
            await addLog(sessionId, 'system', { text: '⏱️ Waktu scan QR habis. Bot disetop, silakan generate ulang.' });
            await authRepo.clear(sessionId);
        } else if (isLoggedOut) {
            await setStatus(sessionId, { connection: 'idle', connected: false, message: 'Sesi kosong. Silakan klik Generate QR.' });
            await addLog(sessionId, 'system', { text: 'Session logged out. Menyiapkan untuk QR baru...' });
            await authRepo.clear(sessionId);
        } else if (shouldReconnect) {
            await setStatus(sessionId, { connection: 'reconnecting', connected: false, message: 'Reconnecting...', lastError: errorMessage });
            await addLog(sessionId, 'error', { text: `❌ Terputus: ${errorMessage}. Mencoba reconnect otomatis...` });
            setTimeout(() => startSession(sessionId).catch((e) => logger.error(e, 'reconnect failed')), RECONNECT_DELAY_MS);
        }
    }
}

export async function restartSession(sessionId) {
    const c = connections.get(sessionId);
    if (!c?.sock) {
        await startSession(sessionId);
        return;
    }
    await addLog(sessionId, 'system', { text: '🔄 Manual restart triggered by user. Merestart koneksi...' });
    c.sock.ws.close();
}

export async function logoutSession(sessionId) {
    const c = connections.get(sessionId);
    if (c?.sock) {
        try {
            await c.sock.logout();
        } catch {
            // Mungkin sudah terputus; lanjut bersihkan saja.
        }
    }
    if (c?.clearAuth) await c.clearAuth();
    else await authRepo.clear(sessionId);

    if (c) c.sock = null;
    setQr(sessionId, null);
    await setStatus(sessionId, { connection: 'idle', connected: false, message: 'WhatsApp logged out', device: null });
}

export async function sendMessage(sessionId, jid, text) {
    const sock = getSocket(sessionId);
    if (!sock) throw new Error('Socket belum siap. Pastikan akun sudah terhubung.');
    await sock.sendMessage(jid, { text });
    await addLog(sessionId, 'outgoing', { text }, jid);
}

export async function deleteSession(sessionId) {
    const c = connections.get(sessionId);
    if (c?.sock) {
        try {
            c.sock.ws.close();
        } catch {
            // abaikan
        }
    }
    connections.delete(sessionId);
    dropRuntime(sessionId);
    await sessionRepo.remove(sessionId); // cascade hapus auth_state/logs/conversations
    await emitSessionsList();
}

/** Saat startup: jalankan ulang akun yang punya creds tersimpan. */
export async function resumeSessions() {
    const sessions = await sessionRepo.list();
    for (const session of sessions) {
        setLogLimit(session.id, session.settings.logLimit);
        if (await authRepo.hasCreds(session.id)) {
            startSession(session.id).catch((e) => logger.error(e, `resume ${session.id} failed`));
        } else {
            await setStatus(session.id, {
                connection: 'idle',
                connected: false,
                message: 'Bot standby. Silakan klik Generate QR.',
            });
        }
    }
}
