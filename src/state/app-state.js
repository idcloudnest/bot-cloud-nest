import { bus, EVENTS } from './events.js';
import { config } from '../config.js';
import * as sessionRepo from '../db/repositories/session.repo.js';
import * as logRepo from '../db/repositories/log.repo.js';
import * as conversationRepo from '../db/repositories/conversation.repo.js';

// State ephemeral per akun (tidak perlu persist): QR aktif + cache log limit.
const runtime = new Map();

function rt(sessionId) {
    if (!runtime.has(sessionId)) {
        runtime.set(sessionId, { qr: null, logLimit: config.logLimit });
    }
    return runtime.get(sessionId);
}

export function dropRuntime(sessionId) {
    runtime.delete(sessionId);
}

export function setLogLimit(sessionId, limit) {
    rt(sessionId).logLimit = Number(limit) || config.logLimit;
}

// --- Daftar akun ---

export async function emitSessionsList() {
    const sessions = await sessionRepo.list();
    // Sisipkan QR aktif (in-memory) ke tiap akun.
    const withQr = sessions.map((s) => ({ ...s, qr: rt(s.id).qr }));
    bus.emit(EVENTS.SESSIONS, withQr);
    return withQr;
}

// --- Status ---

export async function setStatus(sessionId, patch = {}) {
    await sessionRepo.updateStatus(sessionId, patch);
    const session = await sessionRepo.get(sessionId);
    if (!session) return null;

    bus.emit(EVENTS.STATUS, { sessionId, status: session.status });
    await emitSessionsList();
    return session.status;
}

// --- QR (in-memory) ---

export function setQr(sessionId, qr) {
    rt(sessionId).qr = qr;
    bus.emit(EVENTS.QR, { sessionId, qr });
    return qr;
}

export function getQr(sessionId) {
    return rt(sessionId).qr;
}

// --- Settings (per akun, kolom di tabel sessions) ---

export async function updateSettings(sessionId, payload = {}) {
    const session = await sessionRepo.updateSettings(sessionId, payload);
    if (!session) return null;

    rt(sessionId).logLimit = session.settings.logLimit;
    await logRepo.trim(sessionId, session.settings.logLimit);

    bus.emit(EVENTS.SETTINGS, { sessionId, settings: session.settings });
    bus.emit(EVENTS.LOGS_INIT, { sessionId, logs: await logRepo.list(sessionId, session.settings.logLimit) });
    return session.settings;
}

// --- Logs ---

export async function addLog(sessionId, type, payload = {}, jid = null) {
    const limit = rt(sessionId).logLimit;
    const log = await logRepo.add(sessionId, type, payload, jid);
    await logRepo.trim(sessionId, limit);
    bus.emit(EVENTS.LOG, { sessionId, log });
    return log;
}

export async function getLogs(sessionId, limit) {
    return logRepo.list(sessionId, limit ?? rt(sessionId).logLimit);
}

export async function clearLogs(sessionId) {
    const clearedCount = await logRepo.clear(sessionId);
    bus.emit(EVENTS.LOGS_CLEAR, { sessionId, clearedCount });
    return clearedCount;
}

export async function deleteLogs(sessionId, ids = []) {
    const deleted = await logRepo.bulkDelete(sessionId, ids);
    if (deleted > 0) bus.emit(EVENTS.LOGS_DELETED, { sessionId, ids });
    return deleted;
}

// --- Conversations ---

export async function notifyConversations(sessionId) {
    const conversations = await conversationRepo.listBySession(sessionId);
    bus.emit(EVENTS.CONVERSATIONS, { sessionId, conversations });
    return conversations;
}
