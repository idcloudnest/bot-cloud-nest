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

export function clearSession(jid) {
    sessions.delete(jid);
    persistSessions();
}

export function getAllSessions() {
    return Array.from(sessions.entries()).map(([jid, session]) => ({
        jid,
        ...session,
    }));
}
