import makeWASocket, { DisconnectReason } from '@whiskeysockets/baileys';
import { randomBytes } from 'node:crypto';
import pino from 'pino';
import QRCode from 'qrcode';

import { handleMessage } from '../handlers/message.handler.js';
import { handleParticipantsUpdate } from '../commands/group.commands.js';
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
import { config } from '../config.js';

const QR_TIMEOUT_MS = config.qrTimeoutMs;
const RECONNECT_DELAY_MS = 2_000;
const RESTART_DELAY_MS = 300;
const SESSION_ID_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/;

// Live connection state per account: { sock, isStarting, clearAuth, + per-attempt flags }.
const connections = new Map();

// Cache of bot -> owner user id, used to route realtime events to the right user.
const sessionOwners = new Map();

/** Owner user id of a bot (null if unknown/unowned). Used for socket event routing. */
export function getSessionOwner(sessionId) {
    return sessionOwners.get(sessionId) ?? null;
}

function conn(sessionId) {
    if (!connections.has(sessionId)) {
        connections.set(sessionId, { sock: null, isStarting: false, clearAuth: null });
    }
    return connections.get(sessionId);
}

export function getSocket(sessionId) {
    return connections.get(sessionId)?.sock || null;
}

export function listSessions(ownerId = null) {
    return sessionRepo.list(ownerId);
}

// --- Lifecycle ---

/** Build a slug id from a name. Return '' if the result is < 2 characters (fallback needed). */
function slugifyId(text) {
    const slug = String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 24);
    return slug.length >= 2 ? slug : '';
}

/**
 * Generate a unique id automatically: prefix from the name (if any) + a long random token.
 * A 12 hex char token makes duplicates very unlikely; still checked against the DB.
 */
async function generateUniqueId(name) {
    const base = slugifyId(name) || 'wa';
    let candidate = `${base}-${randomBytes(6).toString('hex')}`; // 12 hex chars
    let tries = 0;
    while (await sessionRepo.exists(candidate)) {
        candidate = `${base}-${randomBytes(6).toString('hex')}`;
        if (++tries > 20) {
            candidate = `${base}-${Date.now().toString(36)}${randomBytes(4).toString('hex')}`;
            break;
        }
    }
    return candidate;
}

export async function createSession({ id, name, ownerId = null } = {}) {
    const cleanName = String(name || '').trim();

    // Auto-generate ID if not provided.
    const cleanId = id
        ? String(id).trim().toLowerCase()
        : await generateUniqueId(cleanName);

    if (!SESSION_ID_RE.test(cleanId)) {
        throw new Error('Invalid account ID. Use lowercase letters/digits/-/_ (2-64 characters).');
    }
    if (await sessionRepo.exists(cleanId)) {
        throw new Error(`Account "${cleanId}" already exists.`);
    }

    const session = await sessionRepo.create({ id: cleanId, name: cleanName || cleanId, ownerId });
    sessionOwners.set(cleanId, session.ownerId);
    setLogLimit(cleanId, session.settings.logLimit);
    await emitSessionsList();
    return session;
}

/** Change the bot display name (does not change the id). */
export async function renameSession(sessionId, name) {
    const cleanName = String(name || '').trim();
    if (!cleanName) throw new Error('Bot name is required.');
    if (cleanName.length > 100) throw new Error('Bot name must be at most 100 characters.');

    const updated = await sessionRepo.updateName(sessionId, cleanName);
    if (!updated) throw new Error(`Account "${sessionId}" not found.`);
    await emitSessionsList();
    return updated;
}

export async function startSession(sessionId) {
    const session = await sessionRepo.get(sessionId);
    if (!session) throw new Error(`Account "${sessionId}" not found.`);

    const c = conn(sessionId);
    if (c.isStarting) return c.sock;
    c.isStarting = true;

    setLogLimit(sessionId, session.settings.logLimit);

    // Per-attempt connection flags.
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

        // Group membership changes: enforce the blacklist (auto-kick rejoins).
        sock.ev.on('group-participants.update', async (update) => {
            try {
                const current = await sessionRepo.get(sessionId);
                const groupEnabled = current?.settings?.features?.group !== false;
                await handleParticipantsUpdate(sessionId, sock, update, { groupEnabled });
            } catch (error) {
                logger.error(error, 'group-participants.update handler failed');
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

    // --- Internal handlers (closures over per-attempt flags) ---

    async function handleQrUpdate(qr) {
        // Past the timeout: don't show a new QR (prevents the QR from "reappearing"
        // after the UI timer runs out). Stop the session right away.
        if (qrExpireAt && Date.now() >= qrExpireAt) {
            if (!isConnectedYet && c.sock) {
                isTimeoutReached = true;
                c.sock.ws.close();
            }
            return;
        }

        if (!qrExpireAt) {
            qrExpireAt = Date.now() + QR_TIMEOUT_MS;
            await addLog(sessionId, 'system', { text: '📱 QR Code generated successfully. Please scan it via WhatsApp.' });

            forceKillTimeout = setTimeout(() => {
                if (!isConnectedYet && c.sock) {
                    isTimeoutReached = true;
                    c.sock.ws.close();
                }
            }, QR_TIMEOUT_MS + 500);
        }

        const qrDataUrl = await QRCode.toDataURL(qr);
        setQr(sessionId, { qr, qrDataUrl, expireAt: qrExpireAt, timeoutMs: QR_TIMEOUT_MS, updatedAt: new Date().toISOString() });
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
        const hadActiveQr = Boolean(qrExpireAt); // QR was shown during this attempt
        qrExpireAt = null;
        if (forceKillTimeout) clearTimeout(forceKillTimeout);

        const statusCode =
            lastDisconnect?.error?.output?.statusCode ||
            lastDisconnect?.error?.statusCode ||
            500;
        const errorMessage = lastDisconnect?.error?.message || `Closed with status ${statusCode}`;

        c.sock = null;

        // 515: sent by WhatsApp right after the QR is successfully scanned (pairing done).
        // Normal — the socket MUST be restarted to open the authenticated session.
        const isRestartRequired = statusCode === DisconnectReason.restartRequired; // 515
        // QR was shown but never connected -> QR not scanned / expired.
        // Covers loggedOut/timedOut/408/force-kill: all mean QR expired here.
        const isQrExpired = !isRestartRequired && !isConnectedYet && (hadActiveQr || isTimeoutReached);
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        const shouldReconnect = !isRestartRequired && !isQrExpired && !isLoggedOut;

        if (isRestartRequired) {
            await setStatus(sessionId, { connection: 'connecting', connected: false, message: 'QR scanned, completing login...' });
            await addLog(sessionId, 'system', { text: '🔄 QR scanned successfully. Connecting session...' });
            setTimeout(() => startSession(sessionId).catch((e) => logger.error(e, 'restart after pairing failed')), RESTART_DELAY_MS);
        } else if (isQrExpired) {
            await setStatus(sessionId, { connection: 'idle', connected: false, message: 'QR Code Expired', lastError: errorMessage });
            await addLog(sessionId, 'system', { text: '⏱️ QR scan time is up. Bot stopped, please generate a new one.' });
            await authRepo.clear(sessionId);
        } else if (isLoggedOut) {
            await setStatus(sessionId, { connection: 'idle', connected: false, message: 'Session is empty. Click Generate QR to start.' });
            await addLog(sessionId, 'system', { text: 'Session logged out. Preparing for a new QR...' });
            await authRepo.clear(sessionId);
        } else if (shouldReconnect) {
            await setStatus(sessionId, { connection: 'reconnecting', connected: false, message: 'Reconnecting...', lastError: errorMessage });
            await addLog(sessionId, 'error', { text: `❌ Disconnected: ${errorMessage}. Trying to reconnect automatically...` });
            setTimeout(() => startSession(sessionId).catch((e) => logger.error(e, 'reconnect failed')), RECONNECT_DELAY_MS);
        }

        // Clear the QR AFTER the status is set, so the UI never renders a "qr"
        // state without an image ("QR not available yet") between two events.
        setQr(sessionId, null);
    }
}

export async function restartSession(sessionId) {
    const c = connections.get(sessionId);
    if (!c?.sock) {
        await startSession(sessionId);
        return;
    }
    await addLog(sessionId, 'system', { text: '🔄 Manual restart triggered by user. Restarting connection...' });
    c.sock.ws.close();
}

export async function logoutSession(sessionId) {
    const c = connections.get(sessionId);
    if (c?.sock) {
        try {
            await c.sock.logout();
        } catch {
            // Might already be disconnected; just continue cleaning up.
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
    if (!sock) throw new Error('Socket is not ready. Make sure the account is connected.');
    await sock.sendMessage(jid, { text });
    await addLog(sessionId, 'outgoing', { text }, jid);
}

export async function deleteSession(sessionId) {
    const c = connections.get(sessionId);
    if (c?.sock) {
        try {
            c.sock.ws.close();
        } catch {
            // ignore
        }
    }
    connections.delete(sessionId);
    sessionOwners.delete(sessionId);
    dropRuntime(sessionId);
    await sessionRepo.remove(sessionId); // cascade deletes auth_state/logs/conversations
    await emitSessionsList();
}

/** On startup: restart accounts that have stored creds. */
export async function resumeSessions() {
    const sessions = await sessionRepo.list();
    for (const session of sessions) {
        sessionOwners.set(session.id, session.ownerId);
        setLogLimit(session.id, session.settings.logLimit);
        if (await authRepo.hasCreds(session.id)) {
            startSession(session.id).catch((e) => logger.error(e, `resume ${session.id} failed`));
        } else {
            await setStatus(session.id, {
                connection: 'idle',
                connected: false,
                message: 'Bot standby. Click Generate QR to start.',
            });
        }
    }
}
