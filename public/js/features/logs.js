import { $, $$, escapeHtml, formatDate, setText } from '../core/dom.js';
import { store } from '../core/store.js';
import { api } from '../core/api.js';
import { showToast } from '../ui/toast.js';
import { showConfirmModal } from '../ui/modal.js';

const DEFAULT_LIMIT = 100;

// Active filter (server-side search). Empty = show all.
const filter = { type: '', search: '' };
let searchTimer = null;

function isFilterActive() {
    return Boolean(filter.type || filter.search);
}

function logMatchesFilter(log) {
    if (filter.type && log.type !== filter.type) return false;
    if (filter.search) {
        const q = filter.search.toLowerCase();
        const hay = `${log.type} ${log.jid || ''} ${log.payload?.text || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
    }
    return true;
}

function currentLimit() {
    return Number($('#logLimitInput')?.value || DEFAULT_LIMIT);
}

/** Fetch logs from the server based on the active filter, then render. */
async function applyLogFilter() {
    const id = store.getCurrent();
    if (!id) return;
    try {
        const logs = await api.logs(id, { type: filter.type, search: filter.search, limit: currentLimit() });
        renderLogs(logs);
    } catch (error) {
        showToast(error.message || 'Failed to load logs.', 'error');
    }
}

/** Reset the filter (used when switching accounts). */
export function resetLogFilter() {
    filter.type = '';
    filter.search = '';
    const searchInput = $('#logSearchInput');
    const typeSelect = $('#logTypeFilter');
    if (searchInput) searchInput.value = '';
    if (typeSelect) typeSelect.value = '';
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
    const boxes = $$('.log-checkbox');
    const selected = boxes.filter((cb) => cb.checked).length;

    const btn = $('#btnDeleteSelected');
    if (btn) {
        btn.style.display = selected > 0 ? 'inline-flex' : 'none';
        const counter = btn.querySelector('span');
        if (counter) counter.textContent = selected;
    }

    // Select All / Deselect All button (for the logs currently shown).
    const selBtn = $('#btnSelectAllLogs');
    if (selBtn) {
        const hasLogs = boxes.length > 0;
        selBtn.style.display = hasLogs ? 'inline-flex' : 'none';
        const allChecked = hasLogs && selected === boxes.length;
        selBtn.dataset.checked = allChecked ? '1' : '0';
        selBtn.innerHTML = allChecked
            ? '<i class="fas fa-square"></i> Deselect All'
            : '<i class="fas fa-check-double"></i> Select All';
    }
}

/** Check / uncheck all logs currently shown. */
function setAllChecked(checked) {
    $$('.log-checkbox').forEach((cb) => { cb.checked = checked; });
    updateSelectionButton();
}

/** Render the entire list again (used on init / clear / bulk-delete). */
export function renderLogs(logs = []) {
    const list = $('#logsList');
    if (!list) return;

    setText($('#logCount'), logs.length);

    if (!logs.length) {
        list.innerHTML = isFilterActive()
            ? '<div class="empty">No logs match the filter.</div>'
            : '<div class="empty">No logs yet.</div>';
        updateSelectionButton();
        return;
    }

    const fragment = document.createDocumentFragment();
    logs.forEach((log) => fragment.appendChild(buildLogNode(log)));
    list.replaceChildren(fragment);
    updateSelectionButton();
}

/** Add one new log at the top (incremental, without rebuilding the whole list). */
export function prependLog(log) {
    // When the filter is active, ignore new logs that don't match.
    if (isFilterActive() && !logMatchesFilter(log)) return;

    const list = $('#logsList');
    if (!list) return;

    const empty = list.querySelector('.empty');
    if (empty) empty.remove();

    list.insertBefore(buildLogNode(log), list.firstChild);

    // Trim to the limit.
    const limit = currentLimit();
    while (list.querySelectorAll('.log-item').length > limit) {
        list.lastElementChild?.remove();
    }

    setText($('#logCount'), list.querySelectorAll('.log-item').length);
    updateSelectionButton();
}

/** Remove several logs from the DOM by id. */
export function removeLogs(ids = []) {
    const list = $('#logsList');
    if (!list) return;

    ids.forEach((id) => list.querySelector(`.log-item[data-id="${CSS.escape(id)}"]`)?.remove());

    if (!list.querySelector('.log-item')) {
        list.innerHTML = '<div class="empty">No logs yet.</div>';
    }
    setText($('#logCount'), list.querySelectorAll('.log-item').length);
    updateSelectionButton();
}

export function initLogs() {
    const list = $('#logsList');

    // Event delegation for selection checkboxes.
    list?.addEventListener('change', (event) => {
        if (event.target.classList.contains('log-checkbox')) updateSelectionButton();
    });

    // Filter: text search (debounce) + type.
    $('#logSearchInput')?.addEventListener('input', (e) => {
        clearTimeout(searchTimer);
        const value = e.target.value.trim();
        searchTimer = setTimeout(() => {
            filter.search = value;
            applyLogFilter();
        }, 300);
    });

    $('#logTypeFilter')?.addEventListener('change', (e) => {
        filter.type = e.target.value;
        applyLogFilter();
    });

    // Toggle select all / deselect all (follows the logs currently shown).
    $('#btnSelectAllLogs')?.addEventListener('click', () => {
        const allChecked = $('#btnSelectAllLogs')?.dataset.checked === '1';
        setAllChecked(!allChecked);
    });

    $('#clearLogsButton')?.addEventListener('click', async () => {
        const id = store.getCurrent();
        if (!id) return;

        const confirmed = await showConfirmModal({
            title: 'Clear message logs?',
            message: 'All logs shown in the dashboard will be cleared. The original WhatsApp chats will not be deleted.',
            confirmText: 'Yes, clear logs',
            cancelText: 'Cancel',
        });
        if (!confirmed) return;

        showToast('Clearing logs...', 'info');
        try {
            const result = await api.clearLogs(id);
            renderLogs([]);
            showToast(`${result?.clearedCount || 0} logs cleared successfully.`, 'success');
        } catch (error) {
            showToast(error.message || 'Failed to clear logs.', 'error');
        }
    });

    $('#btnDeleteSelected')?.addEventListener('click', async () => {
        const id = store.getCurrent();
        if (!id) return;

        const ids = $$('.log-checkbox:checked').map((cb) => cb.value);
        if (!ids.length) return;

        const confirmed = await showConfirmModal({
            title: 'Delete Selected Logs?',
            message: `You are about to delete ${ids.length} logs from the screen. Continue?`,
            confirmText: 'Yes, Delete',
        });
        if (!confirmed) return;

        try {
            await api.bulkDeleteLogs(id, ids);
            // Removal from the DOM is handled by the 'session:logs:deleted' socket event.
        } catch (error) {
            showToast(error.message || 'Failed to delete logs.', 'error');
        }
    });
}
