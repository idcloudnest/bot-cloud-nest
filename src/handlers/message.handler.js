import { getSession, setSession } from '../services/session.service.js';
import { addLog, getSettings } from '../state/app-state.js';
import { handleCommand } from './command.handler.js';
import { extractMessageText } from '../utils/formatter.js';

export async function handleMessage(sock, message) {
    const remoteJid = message.key.remoteJid;
    const isFromMe = message.key.fromMe;

    if (!remoteJid || isFromMe) return;

    const text =
        message.message?.conversation ||
        message.message?.extendedTextMessage?.text ||
        '';

    if (!text) return;

    const existingSession = getSession(remoteJid);

    if (!existingSession) {
        setSession(remoteJid, {
            step: 'idle',
            lastMessage: text,
        });
    } else {
        setSession(remoteJid, {
            ...existingSession,
            lastMessage: text,
        });
    }

    await handleCommand(sock, remoteJid, text.trim());
}
