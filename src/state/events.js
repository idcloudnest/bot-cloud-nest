import { EventEmitter } from 'node:events';

// Bus event tunggal untuk seluruh aplikasi. Web server men-subscribe
// dan meneruskan ke client lewat Socket.IO. Semua payload membawa sessionId.
export const bus = new EventEmitter();
bus.setMaxListeners(50);

export const EVENTS = {
    SESSIONS: 'sessions',                 // daftar akun berubah -> Session[]
    STATUS: 'session:status',             // { sessionId, status }
    QR: 'session:qr',                     // { sessionId, qr }
    SETTINGS: 'session:settings',         // { sessionId, settings }
    LOG: 'session:log',                   // { sessionId, log }
    LOGS_INIT: 'session:logs:init',       // { sessionId, logs }
    LOGS_CLEAR: 'session:logs:clear',     // { sessionId, clearedCount }
    LOGS_DELETED: 'session:logs:deleted', // { sessionId, ids }
    CONVERSATIONS: 'session:conversations', // { sessionId, conversations }
};
