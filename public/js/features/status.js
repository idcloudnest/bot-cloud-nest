import { $, formatDate, setText } from '../core/dom.js';
import { store } from '../core/store.js';
import { renderQrState } from './qr.js';
import { renderDevice } from './device.js';

// Pemetaan state koneksi -> tampilan pill (satu sumber kebenaran).
const STATUS_VIEW = {
    starting:     { variant: 'warning', icon: 'fa-circle-notch fa-spin', label: 'Starting' },
    connecting:   { variant: 'warning', icon: 'fa-circle-notch fa-spin', label: 'Connecting...' },
    reconnecting: { variant: 'warning', icon: 'fa-circle-notch fa-spin', label: 'Reconnecting...' },
    qr:           { variant: 'info',    icon: 'fa-qrcode',               label: 'Waiting QR' },
    connected:    { variant: 'success', icon: 'fa-check-circle',         label: 'Connected' },
    open:         { variant: 'success', icon: 'fa-check-circle',         label: 'Connected' },
    idle:         { variant: 'warning', icon: 'fa-pause-circle',         label: 'Standby' },
    logged_out:   { variant: 'danger',  icon: 'fa-times-circle',         label: 'Logged Out' },
    close:        { variant: 'danger',  icon: 'fa-times-circle',         label: 'Disconnected' },
    error:        { variant: 'danger',  icon: 'fa-triangle-exclamation', label: 'Error' },
};

function resolveView(status) {
    const key = String(status.connection || '').toLowerCase();
    if (status.connected) return STATUS_VIEW.connected;
    return STATUS_VIEW[key] || { variant: 'warning', icon: 'fa-circle-notch fa-spin', label: status.message || 'Unknown' };
}

export function renderStatus(status = {}) {
    store.setStatus(status);
    const view = resolveView(status);

    // Topbar pill
    const pill = $('#statusPill');
    if (pill) pill.className = `pill pill-${view.variant}`;

    const icon = $('#statusIcon');
    if (icon) icon.className = `fas ${view.icon}`;

    setText($('#statusPillText'), view.label);

    const updatedAt = $('#statusUpdatedAt');
    if (updatedAt) {
        updatedAt.innerHTML = status.updatedAt
            ? `<i class="fas fa-clock"></i> Last update: ${formatDate(status.updatedAt)}`
            : '<i class="fas fa-clock"></i> Last update: -';
    }

    // Overview cards
    setText($('#connectionText'), status.message || view.label);
    setText($('#lastError'), status.lastError || 'No error');
    setText($('#startedAtValue'), status.startedAt ? formatDate(status.startedAt) : '-');

    // Panel terkait
    renderQrState();
    renderDevice(status);
}
