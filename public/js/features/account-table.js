import { $, escapeHtml, formatDate, setText, toggle } from '../core/dom.js';
import { store } from '../core/store.js';
import { api } from '../core/api.js';
import { showToast } from '../ui/toast.js';
import { openAddAccountModal } from './accounts.js';

// Map status -> label + kelas pill (reuse style pill-* yang sudah ada).
const STATUS_PILL = {
    connected: { label: 'Connected', cls: 'pill-success' },
    open: { label: 'Connected', cls: 'pill-success' },
    qr: { label: 'QR', cls: 'pill-info' },
    connecting: { label: 'Connecting', cls: 'pill-warning' },
    starting: { label: 'Starting', cls: 'pill-warning' },
    reconnecting: { label: 'Reconnecting', cls: 'pill-warning' },
    idle: { label: 'Idle', cls: 'pill-warning' },
    logged_out: { label: 'Logged Out', cls: 'pill-danger' },
    close: { label: 'Disconnected', cls: 'pill-danger' },
    error: { label: 'Error', cls: 'pill-danger' },
};

function statusPill(status = {}) {
    if (status.connected) return STATUS_PILL.connected;
    const key = String(status.connection || '').toLowerCase();
    return STATUS_PILL[key] || { label: key || '-', cls: 'pill-warning' };
}

const state = { page: 1, pageSize: 10, search: '', status: '' };
let searchTimer = null;
let loading = false;

/** Tampilkan view daftar akun (mode 'list'). */
export function showAccountsListView() {
    store.setView('list');

    toggle($('#emptyState'), false, 'grid');
    toggle($('#accountView'), false, 'grid');
    toggle($('#dashboardView'), false, 'grid');
    toggle($('#accountsListView'), true, 'grid');

    // Sembunyikan status & menu per-akun (tidak relevan di daftar).
    toggle($('#statusPill'), false, 'inline-flex');
    toggle($('#statusUpdatedAt'), false, 'flex');
    toggle($('#btnDeleteAccount'), false, 'inline-flex');
    toggle($('#accountIdLine'), false, 'block');
    toggle($('#accountMenu'), false, 'grid');
    setText($('#currentAccountName'), 'Daftar Akun');

    state.page = 1;
    loadAccountTable();
}

/** Muat ulang data tabel sesuai filter & halaman aktif (hanya saat view list). */
export async function refreshAccountTable() {
    if (store.getView() !== 'list') return;
    loadAccountTable();
}

async function loadAccountTable() {
    if (loading) return;
    loading = true;
    const tbody = $('#accountsTable');
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="acc-table-empty">Memuat...</td></tr>';

    try {
        const { data, pagination } = await api.paginateSessions(state);
        state.page = pagination.page;
        renderRows(data);
        renderPagination(pagination);
    } catch (error) {
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="5" class="acc-table-empty">${escapeHtml(error.message || 'Gagal memuat data.')}</td></tr>`;
        }
        showToast(error.message || 'Gagal memuat daftar akun.', 'error');
    } finally {
        loading = false;
    }
}

function renderRows(rows = []) {
    const tbody = $('#accountsTable');
    if (!tbody) return;

    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="acc-table-empty">Tidak ada akun yang cocok.</td></tr>';
        return;
    }

    tbody.innerHTML = rows
        .map((s) => {
            const pill = statusPill(s.status);
            return `
            <tr>
                <td>
                    <div class="acc-cell-name">
                        <strong>${escapeHtml(s.name)}</strong>
                        <small>${escapeHtml(s.status?.message || '-')}</small>
                    </div>
                </td>
                <td><code>${escapeHtml(s.id)}</code></td>
                <td><span class="pill ${pill.cls}">${escapeHtml(pill.label)}</span></td>
                <td>${escapeHtml(formatDate(s.status?.updatedAt))}</td>
                <td>
                    <button class="button-secondary button-sm acc-open" data-id="${escapeHtml(s.id)}">
                        <i class="fas fa-arrow-right"></i> Buka
                    </button>
                </td>
            </tr>`;
        })
        .join('');
}

function renderPagination({ page, pageSize, total, totalPages }) {
    const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, total);

    setText($('#accTableInfo'), `Menampilkan ${start}-${end} dari ${total} akun`);
    setText($('#accPageInfo'), `Halaman ${page} / ${totalPages}`);

    const prev = $('#accPrevPage');
    const next = $('#accNextPage');
    if (prev) prev.disabled = page <= 1;
    if (next) next.disabled = page >= totalPages;
}

export function initAccountTable() {
    $('#listAddAccount')?.addEventListener('click', () => openAddAccountModal());

    $('#accSearchInput')?.addEventListener('input', (e) => {
        clearTimeout(searchTimer);
        const value = e.target.value.trim();
        searchTimer = setTimeout(() => {
            state.search = value;
            state.page = 1;
            loadAccountTable();
        }, 300);
    });

    $('#accStatusFilter')?.addEventListener('change', (e) => {
        state.status = e.target.value;
        state.page = 1;
        loadAccountTable();
    });

    $('#accPageSize')?.addEventListener('change', (e) => {
        state.pageSize = Number(e.target.value) || 10;
        state.page = 1;
        loadAccountTable();
    });

    $('#accPrevPage')?.addEventListener('click', () => {
        if (state.page > 1) {
            state.page -= 1;
            loadAccountTable();
        }
    });

    $('#accNextPage')?.addEventListener('click', () => {
        state.page += 1;
        loadAccountTable();
    });

    // Klik "Buka" -> pindah ke detail akun (lewat hash, router yang menangani).
    $('#accountsTable')?.addEventListener('click', (event) => {
        const btn = event.target.closest('.acc-open');
        if (!btn) return;
        window.location.hash = `#account/${encodeURIComponent(btn.dataset.id)}`;
    });
}
