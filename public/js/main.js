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
import { initSessionUser } from './features/session-user.js';

// --- Initialize interaction handlers (once on load) ---
await initSessionUser();
initAccounts();
initAccountTable();
initDashboard();
initQr();
initDevice();
initLogs();
initConversations();
initSettings();
initSendMessage();

// Hash-based router = the single source of truth for the view.
//   #dashboard / ''      -> dashboard (home)
//   #accounts            -> account list
//   #account/<id>        -> detail of account <id>
//   #overview, #qr, etc. -> anchor section in the currently open account detail
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

// Hide the loading screen after the initial view has rendered.
function hideAppLoading() {
    const loader = document.getElementById('appLoading');
    if (!loader) return;
    loader.classList.add('hide');
    setTimeout(() => loader.remove(), 400);
}
// Give a short delay so the initial data + chart can render, then fade out.
setTimeout(hideAppLoading, 400);

// Only render if the event comes from the currently open account.
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
