import { $ } from '../core/dom.js';

/**
 * Show a confirmation modal. Returns Promise<boolean>.
 * options: { title, message, confirmText, cancelText }
 */
export function showConfirmModal(options = {}) {
    const modal = $('#confirmModal');
    const title = $('#confirmTitle');
    const message = $('#confirmMessage');
    const okButton = $('#confirmOkButton');
    const cancelButton = $('#confirmCancelButton');

    title.textContent = options.title || 'Confirmation';
    message.textContent = options.message || 'Continue with this action?';
    okButton.textContent = options.confirmText || 'Yes';
    cancelButton.textContent = options.cancelText || 'Cancel';

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
