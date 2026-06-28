import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState,
} from '@whiskeysockets/baileys';

import pino from 'pino';
import QRCode from 'qrcode';

import { handleMessage } from './handlers/message.handler.js';
import { addLog, setQr, setStatus } from './state/app-state.js';
import { removeDirSafe } from './utils/fs.js';
import { logger } from './utils/logger.js';

const AUTH_DIR = 'auth_info_baileys';
const QR_TIMEOUT_MS = 60_000;
const RECONNECT_DELAY_MS = 2_000;

let sock = null;
let isStarting = false;

export function getSocket() {
    return sock;
}

export async function startBot() {
    if (isStarting) return sock;
    isStarting = true;

    // State per-sesi koneksi (di-reset tiap kali startBot dipanggil).
    let isConnectedYet = false;
    let qrExpireAt = null;
    let forceKillTimeout = null; // Kill switch manual kalau Baileys freeze.
    let isTimeoutReached = false;

    try {
        setStatus({ connection: 'starting', connected: false, message: 'Starting bot...' });

        const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

        sock = makeWASocket({
            auth: state,
            logger: pino({ level: 'silent' }),
            markOnlineOnConnect: false,
            printQRInTerminal: false,
            browser: ['Cloud Nest Bot', 'Chrome', '1.0.0'],
            qrTimeout: QR_TIMEOUT_MS,
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            logger.debug({ connection, hasQr: Boolean(qr) }, 'connection.update');

            if (qr) {
                await handleQrUpdate(qr);
            }

            if (connection === 'connecting') {
                setStatus({ connection: 'connecting', connected: false, message: 'Connecting to WhatsApp...' });
            }

            if (connection === 'open') {
                handleConnectionOpen();
            }

            if (connection === 'close') {
                handleConnectionClose(lastDisconnect);
            }
        });

        sock.ev.on('messages.upsert', async ({ messages }) => {
            for (const message of messages) {
                await handleMessage(sock, message);
            }
        });

        return sock;
    } catch (error) {
        sock = null;
        setStatus({ connection: 'error', connected: false, message: 'Bot failed to start', lastError: error.message });
        throw error;
    } finally {
        isStarting = false;
    }

    // --- Handler internal (closure atas state per-sesi di atas) ---

    async function handleQrUpdate(qr) {
        // Set waktu kadaluarsa & kill switch hanya sekali per sesi.
        if (!qrExpireAt) {
            qrExpireAt = Date.now() + QR_TIMEOUT_MS;
            addLog('system', { text: '📱 QR Code berhasil di-generate. Silakan scan melalui WhatsApp.' });

            forceKillTimeout = setTimeout(() => {
                if (!isConnectedYet && sock) {
                    isTimeoutReached = true;
                    sock.ws.close();
                }
            }, QR_TIMEOUT_MS + 500);
        }

        const qrDataUrl = await QRCode.toDataURL(qr);
        setQr({ qr, qrDataUrl, expireAt: qrExpireAt });
        setStatus({ connection: 'qr', connected: false, message: 'Waiting for QR scan' });
    }

    function handleConnectionOpen() {
        isConnectedYet = true;
        setQr(null);
        if (forceKillTimeout) clearTimeout(forceKillTimeout);

        const device = {
            id: sock.user?.id || null,
            name: sock.user?.name || null,
            platform: sock.user?.platform || 'WhatsApp',
            connectedAt: new Date().toISOString(),
        };

        setStatus({
            connection: 'connected',
            connected: true,
            message: 'WhatsApp connected',
            device,
            lastError: null,
        });
        addLog('system', { text: `✅ WhatsApp bot connected as ${device.name || 'Unknown'}.` });
    }

    function handleConnectionClose(lastDisconnect) {
        qrExpireAt = null; // Wajib di-reset agar bisa generate ulang.
        if (forceKillTimeout) clearTimeout(forceKillTimeout);

        const statusCode =
            lastDisconnect?.error?.output?.statusCode ||
            lastDisconnect?.error?.statusCode ||
            500;
        const errorMessage = lastDisconnect?.error?.message || `Closed with status ${statusCode}`;

        sock = null;
        setQr(null);

        const isQrTimeout =
            isTimeoutReached ||
            (!isConnectedYet && (statusCode === DisconnectReason.timedOut || statusCode === 408));
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        const shouldReconnect = !isLoggedOut && !isQrTimeout;

        if (isQrTimeout) {
            setStatus({ connection: 'idle', connected: false, message: 'QR Code Kadaluarsa', lastError: errorMessage });
            addLog('system', { text: '⏱️ Waktu scan QR habis. Bot disetop, silakan generate ulang.' });
            setTimeout(() => removeDirSafe(AUTH_DIR), 1000);
        } else if (isLoggedOut) {
            setStatus({ connection: 'idle', connected: false, message: 'Sesi kosong. Silakan klik Generate QR.' });
            addLog('system', { text: 'Session logged out. Menyiapkan untuk QR baru...' });
            setTimeout(() => removeDirSafe(AUTH_DIR), 1000);
        } else if (shouldReconnect) {
            setStatus({ connection: 'reconnecting', connected: false, message: 'Reconnecting...', lastError: errorMessage });
            addLog('system', { text: `❌ Terputus: ${errorMessage}. Mencoba reconnect otomatis...` });
            setTimeout(() => startBot().catch((e) => logger.error(e, 'reconnect failed')), RECONNECT_DELAY_MS);
        }
    }
}

export async function sendWhatsAppMessage(jid, text) {
    if (!sock) throw new Error('Socket belum siap.');
    await sock.sendMessage(jid, { text });
    addLog('outgoing', { jid, text });
}

export async function logoutWhatsApp() {
    if (!sock) throw new Error('Socket belum siap.');
    await sock.logout();
    sock = null;
    setQr(null);
    setStatus({ connection: 'logged_out', connected: false, message: 'WhatsApp logged out' });
}

export async function restartWhatsApp() {
    if (!sock) {
        await startBot();
        return;
    }
    addLog('system', { text: '🔄 Manual restart triggered by user. Merestart koneksi...' });
    sock.ws.close();
}
