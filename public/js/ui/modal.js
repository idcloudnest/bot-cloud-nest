import { $ } from '../core/dom.js';

/**
 * Tampilkan modal konfirmasi. Mengembalikan Promise<boolean>.
 * options: { title, message, confirmText, cancelText }
 */
export function showConfirmModal(options = {}) {
    const modal = $('#confirmModal');
    const title = $('#confirmTitle');
    const message = $('#confirmMessage');
    const okButton = $('#confirmOkButton');
    const cancelButton = $('#confirmCancelButton');

    title.textContent = options.title || 'Konfirmasi';
    message.textContent = options.message || 'Lanjutkan action ini?';
    okButton.textContent = options.confirmText || 'Ya';
    cancelButton.textContent = options.cancelText || 'Batal';

    return new Promise((resolve) => {
        const close = (value) => {
            modal.classList.remove('is-open');
            modal.setAttribute('aria-hidden', 'true');

            okButton.removeEventListener('click', onConfirm);
            cancelButton.removeEventListener('click', onCancel);
            modal.removeEventListener('click', onBackdropClick);
            document.removeEventListener('keydown', onKeyDown);

            setTimeout(() => resolve(value), 160);
        };

        const onConfirm = () => close(true);
        const onCancel = () => close(false);
        const onBackdropClick = (event) => {
            if (event.target === modal) close(false);
        };
        const onKeyDown = (event) => {
            if (event.key === 'Escape') close(false);
        };

        okButton.addEventListener('click', onConfirm);
        cancelButton.addEventListener('click', onCancel);
        modal.addEventListener('click', onBackdropClick);
        document.addEventListener('keydown', onKeyDown);

        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        setTimeout(() => okButton.focus(), 80);
    });
}
