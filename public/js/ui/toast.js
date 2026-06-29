import { $ } from '../core/dom.js';

const TOAST_DURATION_MS = 2600;

/** Show a notification toast. type: 'info' | 'success' | 'error' | 'warning'. */
export function showToast(message, type = 'info') {
    const container = $('#toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('is-visible'));

    setTimeout(() => {
        toast.classList.remove('is-visible');
        setTimeout(() => toast.remove(), 200);
    }, TOAST_DURATION_MS);
}
