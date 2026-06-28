import { $, formatDate, setText, toggle } from '../core/dom.js';
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
        setText($('#deviceName'), 'Belum ada device connected');
        setText($('#deviceDescription'), 'Scan QR WhatsApp untuk menghubungkan device ke bot.');
        setText($('#deviceId'), '-');
        setText($('#devicePlatform'), '-');
        setText($('#deviceConnectedAt'), '-');
        toggle(actions, false);
        return;
    }

    setText($('#deviceName'), device.verifiedName || device.name || 'WhatsApp Device');
    setText($('#deviceDescription'), 'Device ini sedang aktif dan dipakai bot untuk menerima/mengirim pesan.');
    setText($('#deviceId'), device.id || device.lid || '-');
    setText($('#devicePlatform'), device.platform || 'WhatsApp');
    setText($('#deviceConnectedAt'), device.connectedAt ? formatDate(device.connectedAt) : '-');
    toggle(actions, true, 'flex');
}

export function initDevice() {
    $('#btnRestartDevice')?.addEventListener('click', async () => {
        const confirmed = await showConfirmModal({
            title: 'Restart Bot?',
            message: 'Bot akan diputus sementara dan mencoba terhubung kembali. Sesi WA tidak akan dihapus (tidak perlu scan QR ulang).',
            confirmText: 'Ya, Restart',
        });
        if (!confirmed) return;

        showToast('Merestart bot...', 'info');
        try {
            await api.restart();
            showToast('Perintah restart berhasil dikirim.', 'success');
        } catch (error) {
            showToast(error.message || 'Gagal merestart bot.', 'error');
        }
    });

    $('#btnDisconnectDevice')?.addEventListener('click', async () => {
        const confirmed = await showConfirmModal({
            title: 'Disconnect (Logout)?',
            message: 'Akses ke akun WhatsApp ini akan dicabut sepenuhnya. Anda harus scan QR lagi untuk menghubungkan bot.',
            confirmText: 'Ya, Logout',
        });
        if (!confirmed) return;

        showToast('Melogout device...', 'warning');
        try {
            await api.logout();
            showToast('Berhasil logout dari device.', 'success');
        } catch (error) {
            showToast(error.message || 'Gagal logout device.', 'error');
        }
    });
}
