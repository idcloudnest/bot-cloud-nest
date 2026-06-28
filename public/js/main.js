import { socket } from './core/socket.js';
import { store } from './core/store.js';

import { initAccounts, renderAccountList, ensureDetailView, selectSession } from './features/accounts.js';
import { initAccountTable, refreshAccountTable, showAccountsListView } from './features/account-table.js';
import { initDashboard, showDashboardView, refreshDashboard } from './features/dashboard.js';
import { renderStatus } from './features/status.js';
import { renderQr, initQr } from './features/qr.js';
import { initDevice } from './features/device.js';
import { renderLogs, prependLog, removeLogs, initLogs } from './features/logs.js';
import { renderConversations, initConversations } from './features/conversations.js';
import { renderSettings, initSettings } from './features/settings.js';
import { initSendMessage } from './features/send-message.js';

// --- Inisialisasi handler interaksi (sekali saat load) ---
initAccounts();
initAccountTable();
initDashboard();
initQr();
initDevice();
initLogs();
initConversations();
initSettings();
initSendMessage();

// Router berbasis hash = satu-satunya sumber kebenaran tampilan.
//   #dashboard / ''      -> dashboard (home)
//   #accounts            -> daftar akun
//   #account/<id>        -> detail akun <id>
//   #overview, #qr, dst. -> anchor section di detail akun yang sedang dibuka
function applyRoute() {
    const raw = window.location.hash.slice(1);

    if (raw === '' || raw === 'dashboard') {
        showDashboardView();
    } else if (raw === 'accounts') {
        showAccountsListView();
    } else if (raw.startsWith('account/')) {
        selectSession(decodeURIComponent(raw.slice('account/'.length)));
    } else if (store.getCurrent()) {
        ensureDetailView();
    } else {
        showDashboardView();
    }
}
window.addEventListener('hashchange', applyRoute);
applyRoute();

// Hanya render kalau event berasal dari akun yang sedang dibuka.
const forCurrent = (fn) => (payload) => {
    if (payload && store.isCurrent(payload.sessionId)) fn(payload);
};

// --- Socket events ---
socket.on('sessions', (sessions) => {
    renderAccountList(sessions);
    refreshAccountTable();
    refreshDashboard();
});

socket.on('session:status', forCurrent(({ status }) => renderStatus(status)));
socket.on('session:qr', forCurrent(({ qr }) => renderQr(qr)));
socket.on('session:settings', forCurrent(({ settings }) => renderSettings(settings)));

socket.on('session:log', forCurrent(({ log }) => prependLog(log)));
socket.on('session:logs:init', forCurrent(({ logs }) => renderLogs(logs)));
socket.on('session:logs:clear', forCurrent(() => renderLogs([])));
socket.on('session:logs:deleted', forCurrent(({ ids }) => removeLogs(ids)));

socket.on('session:conversations', forCurrent(({ conversations }) => renderConversations(conversations)));
