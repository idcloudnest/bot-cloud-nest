import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState,
} from '@whiskeysockets/baileys';

import { Boom } from '@hapi/boom';
import pino from 'pino';
import QRCode from 'qrcode';

import { handleMessage } from './handlers/message.handler.js';
import { addLog, setQr, setStatus } from './state/app-state.js';
import { removeDirSafe } from './utils/fs.js';

let sock = null;
let isStarting = false;

// KEMBALIKAN KE 60 DETIK: Waktu kadaluarsa QR
const QR_TIMEOUT_MS = 5000;

export function getSocket() {
    return sock;
}

export async function startBot() {
    if (isStarting) return sock;
    isStarting = true;

    // Pastikan 3 variabel ini berada di dalam fungsi startBot
    let isConnectedYet = false;
    let qrExpireAt = null;
    let forceKillTimeout = null; // Kill switch manual

    try {
        setStatus({ connection: 'starting', connected: false, message: 'Starting bot...' });

        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

        sock = makeWASocket({
            auth: state,
            logger: pino({ level: 'silent' }),
            markOnlineOnConnect: false,
            printQRInTerminal: false,
            browser: ['Cloud Nest Bot', 'Chrome', '1.0.0'],
            qrTimeout: QR_TIMEOUT_MS,
        });

        sock.ev.on('creds.update', saveCreds);

        console.log("\n\n\n\n\n");

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            console.log('connection.update:', {
                connection,
                hasQr: Boolean(qr),
            });

            if (qr) {
                // Set waktu kadaluarsa HANYA SEKALI
                if (!qrExpireAt) {
                    qrExpireAt = Date.now() + QR_TIMEOUT_MS;

                    // KILL SWITCH: Jaga-jaga jika Baileys freeze dan tidak memutus koneksi
                    forceKillTimeout = setTimeout(() => {
                        if (!isConnectedYet && sock) {
                            sock.ws.close();
                        }
                    }, QR_TIMEOUT_MS + 1000); // Diberi ekstra 2 detik dari timer UI
                }

                const qrDataUrl = await QRCode.toDataURL(qr);
                setQr({ qr, qrDataUrl, expireAt: qrExpireAt });
                setStatus({ connection: 'qr', connected: false, message: 'Waiting for QR scan' });
            }

            if (connection === 'connecting') {
                setStatus({ connection: 'connecting', connected: false, message: 'Connecting to WhatsApp...' });
            }

            if (connection === 'open') {
                isConnectedYet = true;
                setQr(null);
                if (forceKillTimeout) clearTimeout(forceKillTimeout); // Bersihkan kill switch

                const connectedDevice = {
                    id: sock.user?.id || null,
                    name: sock.user?.name || null,
                    platform: sock.user?.platform || 'WhatsApp',
                    connectedAt: new Date().toISOString(),
                };

                setStatus({ connection: 'connected', connected: true, message: 'WhatsApp connected', device: connectedDevice });
                addLog('system', { text: `✅ WhatsApp bot connected as ${connectedDevice.name || 'Unknown'}.` });
            }

            if (connection === 'close') {
                qrExpireAt = null; // WAJIB DI-RESET AGAR BISA GENERATE ULANG
                if (forceKillTimeout) clearTimeout(forceKillTimeout);

                const statusCode = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.statusCode || 500;
                const errorMessage = lastDisconnect?.error?.message || `Closed with status ${statusCode}`;

                sock = null;
                setQr(null);

                const isQrTimeout = statusCode === DisconnectReason.timedOut || statusCode === 408 || !isConnectedYet;
                const isLoggedOut = statusCode === DisconnectReason.loggedOut;
                const shouldReconnect = !isLoggedOut && !isQrTimeout;

                if (isQrTimeout) {
                    setStatus({ connection: 'idle', connected: false, message: 'QR Code Kadaluarsa', lastError: errorMessage });
                    addLog('system', { text: '⏱️ Waktu scan QR habis. Bot disetop, silakan generate ulang.' });
                    setTimeout(() => removeDirSafe('auth_info_baileys'), 1000);
                } else if (isLoggedOut) {
                    setStatus({ connection: 'idle', connected: false, message: 'Sesi kosong. Silakan klik Generate QR.' });
                    addLog('system', { text: 'Session logged out. Menyiapkan untuk QR baru...' });
                    setTimeout(() => removeDirSafe('auth_info_baileys'), 1000);
                } else if (shouldReconnect) {
                    setStatus({ connection: 'reconnecting', connected: false, message: 'Reconnecting...', lastError: errorMessage });
                    addLog('system', { text: `❌ Terputus: ${errorMessage}. Mencoba reconnect otomatis...` });
                    setTimeout(() => { startBot().catch(e => console.error(e)) }, 2000);
                }
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
