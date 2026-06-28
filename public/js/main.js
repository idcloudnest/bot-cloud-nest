import { socket } from './core/socket.js';
import { $, setText } from './core/dom.js';

import { renderStatus } from './features/status.js';
import { renderQr, initQr } from './features/qr.js';
import { initDevice } from './features/device.js';
import { renderLogs, prependLog, removeLogs, initLogs } from './features/logs.js';
import { renderSessions, initSessions } from './features/sessions.js';
import { renderSettings, initSettings } from './features/settings.js';
import { initSendMessage } from './features/send-message.js';

// --- Inisialisasi handler interaksi (sekali saat load) ---
initQr();
initDevice();
initLogs();
initSessions();
initSettings();
initSendMessage();

// --- Socket events ---
socket.on('status', renderStatus);
socket.on('qr', renderQr);
socket.on('settings', renderSettings);
socket.on('sessions', renderSessions);

socket.on('logs:init', renderLogs);
socket.on('log', prependLog);
socket.on('logs:clear', (payload) => {
    renderLogs([]);
    setText($('#logsFeedback'), `${payload?.clearedCount || 0} log berhasil dibersihkan.`);
});
socket.on('logs:deleted_multiple', (payload) => removeLogs(payload?.ids || []));
