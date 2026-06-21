import { readJson, writeJson } from '../utils/storage.js';

const persistedSessions = readJson('sessions.json', []);
const sessions = new Map(persistedSessions);

function persistSessions() {
    writeJson('sessions.json', Array.from(sessions.entries()));
}

export function getSession(remoteJid) {
    return sessions.get(remoteJid);
}

export function setSession(jid, data) {
    sessions.set(jid, {
        ...data,
        updatedAt: new Date().toISOString(),
    });
    persistSessions();
}

export function updateSession(jid, step, data = {}) {
    const existingSession = sessions.get(jid) || {};

    const newSession = {
        jid,
        step,
        // Gabungkan data lama dengan data baru
        data: { ...existingSession.data, ...data },
        updatedAt: new Date().toISOString()
    };

    sessions.set(jid, newSession);
    persistSessions();

    return newSession;
}

export function clearSession(jid) {
    const isDeleted = sessions.delete(jid);
    persistSessions();

    return isDeleted
}

export function getAllSessions() {
    return Array.from(sessions.entries())
        .map(([jid, session]) => ({ jid,...session }))
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
}
