import { $, escapeHtml, formatDate } from '../core/dom.js';
import { api } from '../core/api.js';
import { showToast } from '../ui/toast.js';

export function renderSessions(sessions = []) {
    const table = $('#sessionsTable');
    if (!table) return;

    if (!sessions.length) {
        table.innerHTML = `
            <tr>
                <td colspan="4">Belum ada conversation aktif. Session akan muncul setelah user chat dan masuk ke flow bot.</td>
            </tr>`;
        return;
    }

    table.innerHTML = sessions
        .map(
            (session) => `
            <tr>
                <td>${escapeHtml(session.jid)}</td>
                <td>${escapeHtml(session.step || '-')}</td>
                <td>${formatDate(session.updatedAt)}</td>
                <td><button class="button-reset-session" data-jid="${escapeHtml(session.jid)}">Reset</button></td>
            </tr>`,
        )
        .join('');
}

export function initSessions() {
    // Event delegation: tombol reset per baris.
    $('#sessionsTable')?.addEventListener('click', async (event) => {
        const btn = event.target.closest('.button-reset-session');
        if (!btn) return;

        try {
            await api.resetSession(btn.dataset.jid);
            // Tabel akan ter-update otomatis lewat event socket 'sessions'.
        } catch (error) {
            showToast(error.message || 'Gagal reset session.', 'error');
        }
    });
}
