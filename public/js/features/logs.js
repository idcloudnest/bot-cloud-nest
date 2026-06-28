import { $, $$, escapeHtml, formatDate, setText } from '../core/dom.js';
import { api } from '../core/api.js';
import { showToast } from '../ui/toast.js';
import { showConfirmModal } from '../ui/modal.js';

const DEFAULT_LIMIT = 100;

function currentLimit() {
    return Number($('#logLimitInput')?.value || DEFAULT_LIMIT);
}

function buildLogNode(log) {
    const article = document.createElement('article');
    article.className = 'log-item';
    article.dataset.id = log.id;

    const jidPart = log.jid ? ` • ${escapeHtml(log.jid)}` : '';
    article.innerHTML = `
        <input type="checkbox" class="log-checkbox" value="${escapeHtml(log.id)}" />
        <div class="log-body">
            <div class="log-meta">
                <span>${escapeHtml(log.type)}${jidPart}</span>
                <span>${formatDate(log.timestamp)}</span>
            </div>
            <div class="log-text">${escapeHtml(log.payload?.text || '')}</div>
        </div>
    `;
    return article;
}

function updateSelectionButton() {
    const selected = $$('.log-checkbox:checked').length;
    const btn = $('#btnDeleteSelected');
    if (!btn) return;

    btn.style.display = selected > 0 ? 'inline-flex' : 'none';
    const counter = btn.querySelector('span');
    if (counter) counter.textContent = selected;
}

/** Render ulang seluruh list (dipakai saat init / clear / bulk-delete). */
export function renderLogs(logs = []) {
    const list = $('#logsList');
    if (!list) return;

    setText($('#logCount'), logs.length);

    if (!logs.length) {
        list.innerHTML = '<div class="empty">Belum ada log.</div>';
        updateSelectionButton();
        return;
    }

    const fragment = document.createDocumentFragment();
    logs.forEach((log) => fragment.appendChild(buildLogNode(log)));
    list.replaceChildren(fragment);
    updateSelectionButton();
}

/** Tambah satu log baru di atas (incremental, tanpa rebuild seluruh list). */
export function prependLog(log) {
    const list = $('#logsList');
    if (!list) return;

    const empty = list.querySelector('.empty');
    if (empty) empty.remove();

    list.insertBefore(buildLogNode(log), list.firstChild);

    // Trim sesuai limit.
    const limit = currentLimit();
    while (list.querySelectorAll('.log-item').length > limit) {
        list.lastElementChild?.remove();
    }

    setText($('#logCount'), list.querySelectorAll('.log-item').length);
    updateSelectionButton();
}

/** Buang beberapa log dari DOM berdasarkan id. */
export function removeLogs(ids = []) {
    const list = $('#logsList');
    if (!list) return;

    ids.forEach((id) => list.querySelector(`.log-item[data-id="${CSS.escape(id)}"]`)?.remove());

    if (!list.querySelector('.log-item')) {
        list.innerHTML = '<div class="empty">Belum ada log.</div>';
    }
    setText($('#logCount'), list.querySelectorAll('.log-item').length);
    updateSelectionButton();
}

export function initLogs() {
    const list = $('#logsList');

    // Event delegation untuk checkbox seleksi.
    list?.addEventListener('change', (event) => {
        if (event.target.classList.contains('log-checkbox')) updateSelectionButton();
    });

    $('#clearLogsButton')?.addEventListener('click', async () => {
        const confirmed = await showConfirmModal({
            title: 'Clear message logs?',
            message: 'Semua log yang tampil di dashboard akan dibersihkan. Chat WhatsApp asli tidak akan terhapus.',
            confirmText: 'Ya, clear logs',
            cancelText: 'Batal',
        });
        if (!confirmed) return;

        showToast('Membersihkan logs...', 'info');
        try {
            const result = await api.clearLogs();
            renderLogs([]);
            showToast(`${result?.clearedCount || 0} log berhasil dibersihkan.`, 'success');
        } catch (error) {
            showToast(error.message || 'Gagal clear logs.', 'error');
        }
    });

    $('#btnDeleteSelected')?.addEventListener('click', async () => {
        const ids = $$('.log-checkbox:checked').map((cb) => cb.value);
        if (!ids.length) return;

        const confirmed = await showConfirmModal({
            title: 'Hapus Log Terpilih?',
            message: `Anda akan menghapus ${ids.length} log dari layar. Lanjutkan?`,
            confirmText: 'Ya, Hapus',
        });
        if (!confirmed) return;

        try {
            await api.bulkDeleteLogs(ids);
            // Penghapusan dari DOM ditangani oleh event socket 'logs:deleted_multiple'.
        } catch (error) {
            showToast(error.message || 'Gagal menghapus log.', 'error');
        }
    });
}
