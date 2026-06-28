import { $, setText, toggle } from '../core/dom.js';
import { store } from '../core/store.js';
import { api } from '../core/api.js';
import { showToast } from '../ui/toast.js';
import { showConfirmModal } from '../ui/modal.js';

import { renderStatus } from './status.js';
import { renderSettings } from './settings.js';
import { renderLogs } from './logs.js';
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

// --- Sinkronisasi daftar akun (dipakai untuk auto-select & menu sidebar) ---

export function renderAccountList(sessions = []) {
    knownIds = sessions.map((s) => s.id);

    // Akun aktif terhapus -> kembali ke daftar.
    const current = store.getCurrent();
    if (current && !knownIds.includes(current)) {
        store.setCurrent(null);
        if (window.location.hash.startsWith('#account/')) {
            window.location.hash = '#accounts';
        }
    }

    updateAccountMenu(sessions);
}

/** Update grup menu "Akun aktif" di sidebar (hanya tampil di view detail). */
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

/** ID akun yang diketahui (dipakai modul tabel daftar akun). */
export function getKnownIds() {
    return knownIds;
}

/** Kembali ke tampilan detail akun dari tampilan daftar. */
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

    // Topbar status & aksi hanya relevan saat ada akun terpilih.
    toggle($('#statusPill'), visible, 'inline-flex');
    toggle($('#statusUpdatedAt'), visible, 'flex');
    toggle($('#btnDeleteAccount'), visible, 'inline-flex');
    toggle($('#accountIdLine'), visible, 'block');

    if (!visible) {
        setText($('#currentAccountName'), 'Bot Control Center');
        toggle($('#accountMenu'), false);
    }
}

// --- Pilih akun + muat snapshot ---

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
        const dot = $('#navAccountDot');
        if (dot) dot.className = `nav-account-dot dot-${dotVariant(snap.status)}`;
        store.setQr(snap.qr || null);
        renderStatus(snap.status || {});
        renderSettings(snap.settings || {});
        renderLogs(snap.logs || []);
        renderConversations(snap.conversations || []);
    } catch (error) {
        showToast(error.message || 'Gagal memuat akun.', 'error');
        store.setCurrent(null);
        window.location.hash = '#accounts';
    }
}

// --- Init: tambah & hapus akun ---

function openAddModal(open) {
    const modal = $('#addAccountModal');
    if (!modal) return;
    modal.classList.toggle('is-open', open);
    modal.setAttribute('aria-hidden', String(!open));
    if (open) setTimeout(() => $('#accountIdInput')?.focus(), 80);
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
        const id = $('#accountIdInput').value.trim().toLowerCase();
        const name = $('#accountNameInput').value.trim() || id;

        try {
            const session = await api.createSession(id, name);
            openAddModal(false);
            $('#addAccountForm').reset();
            showToast(`Akun "${session.name}" dibuat.`, 'success');
            window.location.hash = `#account/${encodeURIComponent(session.id)}`;
        } catch (error) {
            showToast(error.message || 'Gagal membuat akun.', 'error');
        }
    });

    $('#btnDeleteAccount')?.addEventListener('click', async () => {
        const id = store.getCurrent();
        if (!id) return;

        const confirmed = await showConfirmModal({
            title: 'Hapus Akun?',
            message: `Akun "${id}" beserta sesi WhatsApp, log, dan percakapannya akan dihapus permanen. Lanjutkan?`,
            confirmText: 'Ya, Hapus',
        });
        if (!confirmed) return;

        try {
            await api.deleteSession(id);
            store.setCurrent(null);
            window.location.hash = '#accounts';
            showToast('Akun dihapus.', 'success');
            // Daftar akan ter-refresh via event 'sessions'.
        } catch (error) {
            showToast(error.message || 'Gagal menghapus akun.', 'error');
        }
    });
}
