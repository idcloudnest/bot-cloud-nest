import { $, setText, toggle } from '../core/dom.js';
import { store } from '../core/store.js';
import { api } from '../core/api.js';
import { showToast } from '../ui/toast.js';
import { showConfirmModal } from '../ui/modal.js';

import { renderStatus } from './status.js';
import { renderSettings } from './settings.js';
import { renderLogs, resetLogFilter } from './logs.js';
import { renderConversations } from './conversations.js';

const DOT_VARIANT = {
    connected: 'success', open: 'success',
    qr: 'info', connecting: 'warning', starting: 'warning', reconnecting: 'warning',
    idle: 'warning', logged_out: 'danger', close: 'danger', error: 'danger',
};

function dotVariant(status = {}) {
    if (status.connected) return 'success';
    return DOT_VARIANT[String(status.connection || '').toLowerCase()] || 'warning';
}

let knownIds = [];

// --- Account list sync (used for auto-select & sidebar menu) ---

export function renderAccountList(sessions = []) {
    knownIds = sessions.map((s) => s.id);

    // Active account was deleted -> go back to the list.
    const current = store.getCurrent();
    if (current && !knownIds.includes(current)) {
        store.setCurrent(null);
        if (window.location.hash.startsWith('#account/')) {
            window.location.hash = '#accounts';
        }
    }

    updateAccountMenu(sessions);
}

/** Update the "Active account" menu group in the sidebar (only shown in detail view). */
function updateAccountMenu(sessions = []) {
    const menu = $('#accountMenu');
    const current = sessions.find((s) => s.id === store.getCurrent());
    if (current && store.getView() === 'detail') {
        setText($('#navAccountName'), current.name);
        const dot = $('#navAccountDot');
        if (dot) dot.className = `nav-account-dot dot-${dotVariant(current.status)}`;
        toggle(menu, true, 'grid');
    } else {
        toggle(menu, false, 'grid');
    }
}

/** Known account IDs (used by the account list table module). */
export function getKnownIds() {
    return knownIds;
}

/** Return to the account detail view from the list view. */
export function ensureDetailView() {
    if (store.getView() !== 'list') return;
    store.setView('detail');
    const id = store.getCurrent() || knownIds[0];
    if (id) selectSession(id);
    else showAccountView(false);
}

function showAccountView(visible) {
    toggle($('#dashboardView'), false, 'grid');
    toggle($('#accountsListView'), false, 'grid');
    toggle($('#accountView'), visible, 'grid');
    toggle($('#emptyState'), !visible, 'grid');

    // Topbar status & actions are only relevant when an account is selected.
    toggle($('#statusPill'), visible, 'inline-flex');
    toggle($('#statusUpdatedAt'), visible, 'flex');
    toggle($('#btnDeleteAccount'), visible, 'inline-flex');
    toggle($('#accountIdLine'), visible, 'block');

    if (!visible) {
        setText($('#currentAccountName'), 'Bot Control Center');
        toggle($('#accountMenu'), false);
    }
}

// --- Select account + load snapshot ---

export async function selectSession(id) {
    store.setCurrent(id);
    store.setView('detail');
    showAccountView(true);
    toggle($('#accountMenu'), true, 'grid');

    try {
        const snap = await api.getSession(id);
        setText($('#currentAccountName'), snap.name);
        setText($('#currentAccountId'), snap.id);
        setText($('#navAccountName'), snap.name);
        // Fill the rename field in Settings.
        const nameInput = $('#botNameInput');
        if (nameInput) nameInput.value = snap.name || '';
        setText($('#botIdHint'), `ID: ${snap.id}`);
        const dot = $('#navAccountDot');
        if (dot) dot.className = `nav-account-dot dot-${dotVariant(snap.status)}`;
        store.setQr(snap.qr || null);
        renderStatus(snap.status || {});
        renderSettings(snap.settings || {});
        resetLogFilter();
        renderLogs(snap.logs || []);
        renderConversations(snap.conversations || []);
    } catch (error) {
        showToast(error.message || 'Failed to load account.', 'error');
        store.setCurrent(null);
        window.location.hash = '#accounts';
    }
}

// --- Init: add & delete account ---

function openAddModal(open) {
    const modal = $('#addAccountModal');
    if (!modal) return;
    modal.classList.toggle('is-open', open);
    modal.setAttribute('aria-hidden', String(!open));
    if (open) setTimeout(() => $('#accountNameInput')?.focus(), 80);
}

export function openAddAccountModal() {
    openAddModal(true);
}

export function initAccounts() {
    $('#btnAddAccount')?.addEventListener('click', () => openAddModal(true));
    $('#emptyAddAccount')?.addEventListener('click', () => openAddModal(true));
    $('#addAccountCancel')?.addEventListener('click', () => openAddModal(false));
    $('#addAccountModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'addAccountModal') openAddModal(false);
    });

    $('#addAccountForm')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const name = $('#accountNameInput').value.trim();

        try {
            const session = await api.createSession(name);
            openAddModal(false);
            $('#addAccountForm').reset();
            showToast(`Account "${session.name}" created (ID: ${session.id}).`, 'success');
            window.location.hash = `#account/${encodeURIComponent(session.id)}`;
        } catch (error) {
            showToast(error.message || 'Failed to create account.', 'error');
        }
    });

    $('#btnDeleteAccount')?.addEventListener('click', async () => {
        const id = store.getCurrent();
        if (!id) return;

        const confirmed = await showConfirmModal({
            title: 'Delete Account?',
            message: `Account "${id}" along with its WhatsApp session, logs, and conversations will be permanently deleted. Continue?`,
            confirmText: 'Yes, Delete',
        });
        if (!confirmed) return;

        try {
            await api.deleteSession(id);
            store.setCurrent(null);
            window.location.hash = '#accounts';
            showToast('Account deleted.', 'success');
            // The list will refresh via the 'sessions' event.
        } catch (error) {
            showToast(error.message || 'Failed to delete account.', 'error');
        }
    });
}
