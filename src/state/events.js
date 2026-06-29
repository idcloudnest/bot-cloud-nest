import { EventEmitter } from 'node:events';

// Single event bus for the whole application. The web server subscribes
// and forwards to clients via Socket.IO. Every payload carries a sessionId.
export const bus = new EventEmitter();
bus.setMaxListeners(50);

export const EVENTS = {
    SESSIONS: 'sessions',                 // account list changed -> Session[]
    STATUS: 'session:status',             // { sessionId, status }
    QR: 'session:qr',                     // { sessionId, qr }
    SETTINGS: 'session:settings',         // { sessionId, settings }
    LOG: 'session:log',                   // { sessionId, log }
    LOGS_INIT: 'session:logs:init',       // { sessionId, logs }
    LOGS_CLEAR: 'session:logs:clear',     // { sessionId, clearedCount }
    LOGS_DELETED: 'session:logs:deleted', // { sessionId, ids }
    CONVERSATIONS: 'session:conversations', // { sessionId, conversations }
};
