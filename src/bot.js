import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState,
} from '@whiskeysockets/baileys';

import { Boom } from '@hapi/boom';
import pino from 'pino';
import QRCode from 'qrcode';

import { handleMessage } from './handlers/message.handler.js';

import { addLog, setQr, setStatus } from './state/app-state.js';

import {
	setCurrentSock,
	clearCurrentSock,
	setStartSockHandler,
	isDeviceControlBusy
} from "./services/device-control.js";

let sock = null;
let isStarting = false;

export function getSocket() {
    return sock;
}

export async function startBot() {
    if (isStarting) {
        addLog('system', {
            text: 'Bot sedang start/reconnect, skip duplicate start.',
        });
        return sock;
    }

    isStarting = true;

    try {
        setStatus({
            connection: 'starting',
            connected: false,
            message: 'Starting bot...',
            lastError: null,
        });

        addLog('system', {
            text: 'Starting WhatsApp bot...',
        });

        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

        // penting: jangan pakai "const sock" di sini
        sock = makeWASocket({
            auth: state,
            logger: pino({ level: 'silent' }),
            markOnlineOnConnect: false,
            printQRInTerminal: false,
            browser: ['Cloud Nest Bot', 'Chrome', '1.0.0'],
        });

        sock.ev.on('creds.update', saveCreds);

        console.log("\n\n\n\n");

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            console.log('connection.update:', {
                connection,
                hasQr: Boolean(qr),
            });

            if (qr) {
                const qrDataUrl = await QRCode.toDataURL(qr);

                setQr({
                    qr,
                    qrDataUrl,
                    updatedAt: new Date().toISOString(),
                });

                setStatus({
                    connection: 'qr',
                    connected: false,
                    message: 'Waiting for QR scan',
                    lastError: null,
                });

                addLog('system', {
                    text: 'QR baru tersedia di dashboard.',
                });

            }

            if (connection === 'connecting') {
                setStatus({
                    connection: 'connecting',
                    connected: false,
                    message: 'Connecting to WhatsApp...',
                    lastError: null,
                });

            }

            if (connection === 'open') {
                // setQr(null);

                // setStatus({
                //     connection: 'connected',
                //     connected: true,
                //     message: 'WhatsApp connected',
                //     lastError: null,
                // });

                // addLog('system', {
                //     text: '✅ WhatsApp bot connected.',
                // });
                setQr(null);

                const connectedDevice = {
                    id: sock.user?.id || null,
                    lid: sock.user?.lid || null,
                    name: sock.user?.name || null,
                    verifiedName: sock.user?.verifiedName || null,
                    platform: sock.user?.platform || 'WhatsApp',
                    connectedAt: new Date().toISOString(),
                };

                setStatus({
                    connection: 'connected',
                    connected: true,
                    message: 'WhatsApp connected',
                    lastError: null,
                    device: connectedDevice,
                });

                addLog('system', {
                    text: `✅ WhatsApp bot connected as ${connectedDevice.name || connectedDevice.id || 'Unknown device'}.`,
                });
            }

            if (connection === 'close') {
                const statusCode =
                    lastDisconnect?.error instanceof Boom
                        ? lastDisconnect.error.output.statusCode
                        : new Boom(lastDisconnect?.error).output.statusCode;

                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                const errorMessage =
                    lastDisconnect?.error?.message ||
                    `Connection closed with status code ${statusCode || 'unknown'}`;

                sock = null;
                setQr(null);

                setStatus({
                    connection: shouldReconnect ? 'reconnecting' : 'logged_out',
                    connected: false,
                    message: shouldReconnect ? 'Reconnecting...' : 'Logged out',
                    lastError: errorMessage,
                    device: null,
                });

                addLog('system', {
                    text: `❌ Connection closed: ${errorMessage}`,
                });

                addLog('system', {
                    text: `Reconnect: ${shouldReconnect}`,
                });

                if (shouldReconnect) {
                    setTimeout(() => {
                        startBot().catch((error) => {
                            addLog('system', {
                                text: `Reconnect failed: ${error.message}`,
                            });
                        });
                    }, 2000);
                } else {
                    addLog('system', {
                        text: 'Session logged out. Delete auth_info_baileys and scan QR again.',
                    });
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

        setStatus({
            connection: 'error',
            connected: false,
            message: 'Bot failed to start',
            lastError: error.message,
        });

        addLog('system', {
            text: `Bot failed to start: ${error.message}`,
        });

        throw error;
    } finally {
        isStarting = false;
    }
}

export async function sendWhatsAppMessage(jid, text) {
    if (!sock) {
        throw new Error('Socket belum siap. Pastikan bot sudah connected.');
    }

    await sock.sendMessage(jid, { text });

    addLog('outgoing', {
        jid,
        text,
    });
}

export async function logoutWhatsApp() {
    if (!sock) {
        throw new Error('Socket belum siap.');
    }

    await sock.logout();

    sock = null;
    setQr(null);

    setStatus({
        connection: 'logged_out',
        connected: false,
        message: 'WhatsApp logged out',
        lastError: null,
        device: null,
    });

    addLog('system', {
        text: 'WhatsApp logged out.',
    });
}
