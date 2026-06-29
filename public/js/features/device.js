import { $, formatDate, setText, toggle } from '../core/dom.js';
import { store } from '../core/store.js';
import { api } from '../core/api.js';
import { showToast } from '../ui/toast.js';
import { showConfirmModal } from '../ui/modal.js';

export function renderDevice(status = {}) {
    const device = status.device || null;
    const isConnected = Boolean(status.connected && device);

    const badge = $('#deviceStatusBadge');
    if (badge) {
        badge.textContent = isConnected ? 'Connected' : 'Not Connected';
        badge.className = `device-badge ${isConnected ? 'connected' : 'disconnected'}`;
    }

    const card = $('#deviceCard');
    if (card) card.className = `device-card ${isConnected ? '' : 'is-empty'}`;

    const actions = $('#deviceActions');

    if (!isConnected) {
        setText($('#deviceName'), 'No device connected yet');
        setText($('#deviceDescription'), 'Scan the WhatsApp QR to connect a device to the bot.');
        setText($('#deviceId'), '-');
        setText($('#devicePlatform'), '-');
        setText($('#deviceConnectedAt'), '-');
        toggle(actions, false);
        return;
    }

    setText($('#deviceName'), device.verifiedName || device.name || 'WhatsApp Device');
    setText($('#deviceDescription'), 'This device is active and used by the bot to receive/send messages.');
    setText($('#deviceId'), device.id || device.lid || '-');
    setText($('#devicePlatform'), device.platform || 'WhatsApp');
    setText($('#deviceConnectedAt'), device.connectedAt ? formatDate(device.connectedAt) : '-');
    toggle(actions, true, 'flex');
}

export function initDevice() {
    $('#btnRestartDevice')?.addEventListener('click', async () => {
        const id = store.getCurrent();
        if (!id) return;

        const confirmed = await showConfirmModal({
            title: 'Restart Bot?',
            message: 'The bot will be temporarily disconnected and try to reconnect. The WA session will not be deleted (no need to scan the QR again).',
            confirmText: 'Yes, Restart',
        });
        if (!confirmed) return;

        showToast('Restarting bot...', 'info');
        try {
            await api.restart(id);
            showToast('Restart command sent successfully.', 'success');
        } catch (error) {
            showToast(error.message || 'Failed to restart bot.', 'error');
        }
    });

    $('#btnDisconnectDevice')?.addEventListener('click', async () => {
        const id = store.getCurrent();
        if (!id) return;

        const confirmed = await showConfirmModal({
            title: 'Disconnect (Logout)?',
            message: 'Access to this WhatsApp account will be fully revoked. You will have to scan the QR again to connect the bot.',
            confirmText: 'Yes, Logout',
        });
        if (!confirmed) return;

        showToast('Logging out device...', 'warning');
        try {
            await api.logout(id);
            showToast('Successfully logged out from the device.', 'success');
        } catch (error) {
            showToast(error.message || 'Failed to log out device.', 'error');
        }
    });
}
