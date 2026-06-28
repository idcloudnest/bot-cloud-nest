import { $, escapeHtml, formatDate } from '../core/dom.js';
import { store } from '../core/store.js';
import { api } from '../core/api.js';
import { showToast } from '../ui/toast.js';

export function renderConversations(conversations = []) {
    const table = $('#sessionsTable');
    if (!table) return;

    if (!conversations.length) {
        table.innerHTML = `
            <tr>
                <td colspan="4">Belum ada conversation aktif. Akan muncul setelah user chat dan masuk ke flow bot.</td>
            </tr>`;
        return;
    }

    table.innerHTML = conversations
        .map(
            (conv) => `
            <tr>
                <td>${escapeHtml(conv.jid)}</td>
                <td>${escapeHtml(conv.step || '-')}</td>
                <td>${formatDate(conv.updatedAt)}</td>
                <td><button class="button-reset-session" data-jid="${escapeHtml(conv.jid)}">Reset</button></td>
            </tr>`,
        )
        .join('');
}

export function initConversations() {
    $('#sessionsTable')?.addEventListener('click', async (event) => {
        const btn = event.target.closest('.button-reset-session');
        if (!btn) return;

        const id = store.getCurrent();
        if (!id) return;

        try {
            await api.resetConversation(id, btn.dataset.jid);
            // Tabel ter-update otomatis lewat event 'session:conversations'.
        } catch (error) {
            showToast(error.message || 'Gagal reset conversation.', 'error');
        }
    });
}
