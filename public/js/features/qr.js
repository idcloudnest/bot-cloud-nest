import { $, formatDate, setText, toggle } from '../core/dom.js';
import { store } from '../core/store.js';
import { api } from '../core/api.js';
import { showToast } from '../ui/toast.js';

const GENERATE_QR_HTML = '<i class="fas fa-qrcode"></i> Generate QR Code';

let qrTimerInterval = null;
let lastEmptyKey = null;
let lastTimeoutSec = 60; // seconds, updated from the QR payload (backend config)

// Replay the entrance animation on an element (restart CSS animation via reflow).
function replayAnimation(el) {
    if (!el) return;
    el.style.animation = 'none';
    void el.offsetWidth; // force reflow
    el.style.animation = '';
}

// --- QR countdown timer ---

function stopQrTimer() {
    if (qrTimerInterval) {
        clearInterval(qrTimerInterval);
        qrTimerInterval = null;
    }
    const container = $('#qrTimerContainer');
    if (container) {
        container.style.display = 'none';
        container.classList.remove('timer-pulse', 'timer-danger');
    }
}

function startQrTimer(expireAtMs) {
    stopQrTimer();

    const container = $('#qrTimerContainer');
    const countText = $('#qrTimerCount');
    if (!container || !countText || !expireAtMs || expireAtMs <= Date.now()) return;

    const tick = () => {
        const remaining = Math.ceil((expireAtMs - Date.now()) / 1000);

        if (remaining <= 0) {
            countText.textContent = '0';
            stopQrTimer();
            // Clear the QR + set idle so the QR image & timer disappear together,
            // then the "QR Expired" card appears. Backend will also send idle.
            store.setStatus({ connection: 'idle', connected: false, message: 'QR Code Expired' });
            store.setQr(null);
            renderQrState();
            return;
        }

        countText.textContent = remaining;
        container.classList.toggle('timer-danger', remaining <= 10);
        container.classList.toggle('timer-pulse', remaining > 10);
    };

    container.style.display = 'inline-flex';
    tick();
    qrTimerInterval = setInterval(tick, 1000);
}

// --- Render ---

function extractQrDataUrl(payload) {
    if (!payload) return null;
    if (payload.qrDataUrl) return payload.qrDataUrl;
    if (payload.qr?.qrDataUrl) return payload.qr.qrDataUrl;
    if (typeof payload === 'string' && payload.startsWith('data:image')) return payload;
    if (typeof payload.qr === 'string' && payload.qr.startsWith('data:image')) return payload.qr;
    return null;
}

export function renderQr(payload = null) {
    store.setQr(payload);
    renderQrState();
}

export function renderQrState() {
    const qrImage = $('#qrImage');
    const qrEmpty = $('#qrEmpty');
    if (!qrImage || !qrEmpty) return;

    const status = store.getStatus() || {};
    const payload = store.getQr() || {};
    const connection = String(status.connection || '').toLowerCase();
    const connected = Boolean(status.connected);

    const qrDataUrl = extractQrDataUrl(payload);
    const updatedAt = payload?.updatedAt || payload?.qr?.updatedAt || null;
    const expireAt = payload?.expireAt || payload?.qr?.expireAt || null;

    const btnGenerate = $('#btnGenerateQr');

    const setBadge = (text, type) => {
        const badge = $('#qrStateBadge');
        if (badge) {
            badge.textContent = text;
            badge.className = `qr-state-badge ${type}`;
        }
    };
    const setHint = (html, type) => {
        const hint = $('#qrHintBox');
        if (hint) {
            hint.innerHTML = html;
            hint.className = `qr-hint ${type}`;
        }
    };
    const setEmpty = (title, description, icon = '📱') => {
        const iconEl = qrEmpty.querySelector('.qr-empty-icon');
        if (iconEl) iconEl.textContent = icon;
        setText($('#qrStateTitle'), title);
        const desc = $('#qrStateDescription');
        if (desc) desc.innerHTML = description;

        // Re-animate only when the state actually changes (avoid spam).
        if (lastEmptyKey !== title) {
            lastEmptyKey = title;
            replayAnimation(qrEmpty);
            replayAnimation(iconEl);
            replayAnimation($('#btnGenerateQr'));
        }
    };

    setText($('#qrConnectionText'), status.message || status.connection || '-');
    setText($('#qrStatusUpdatedAt'), status.updatedAt ? formatDate(status.updatedAt) : '-');
    setText($('#qrUpdatedAt'), updatedAt ? `QR updated: ${formatDate(updatedAt)}` : 'QR updated: -');

    const mainDesc = $('#qrMainDescription');

    // 1. CONNECTED
    if (connected || connection === 'connected' || connection === 'open') {
        stopQrTimer();
        qrImage.removeAttribute('src');
        toggle(qrImage, false);
        qrEmpty.style.display = 'grid';
        toggle(btnGenerate, false);

        setBadge('Connected', 'connected');
        setEmpty('WhatsApp is connected', 'The bot is connected to WhatsApp. The QR is hidden automatically for security.', '✅');
        setHint('The bot is ready to receive and send messages. To scan again, log out of the WhatsApp session first.', 'success');
        setText(mainDesc, 'WhatsApp has been successfully connected to the bot.');
        return;
    }

    // 2. QR READY (ignore a QR whose expiry has passed so it doesn't "show up again")
    if (qrDataUrl && (!expireAt || expireAt > Date.now())) {
        const timeoutMs = payload?.timeoutMs || payload?.qr?.timeoutMs;
        if (timeoutMs) lastTimeoutSec = Math.round(timeoutMs / 1000);
        qrImage.src = qrDataUrl;
        qrImage.style.display = 'block';
        qrEmpty.style.display = 'none';
        toggle(btnGenerate, false);
        lastEmptyKey = null;

        if (expireAt && !qrTimerInterval) startQrTimer(expireAt);

        setBadge('QR Ready', 'ready');
        setHint('Please scan this QR from WhatsApp > Linked Devices. The QR may change automatically if it expires.', 'info');
        setText(mainDesc, 'Scan the QR below to connect WhatsApp to the bot.');
        return;
    }

    // 3. RECONNECTING / DISCONNECTED / ERROR / IDLE
    qrImage.removeAttribute('src');
    toggle(qrImage, false);
    qrEmpty.style.display = 'grid';
    stopQrTimer();

    if (btnGenerate) {
        btnGenerate.style.display = 'none';
        btnGenerate.disabled = false;
        btnGenerate.innerHTML = GENERATE_QR_HTML;
    }

    if (connection === 'logged_out' || connection === 'idle') {
        setBadge('Disconnected', 'disconnected');
        if (status.message === 'QR Code Expired') {
            setEmpty('QR Code Expired', `The time to scan the QR (${lastTimeoutSec} seconds) has run out. For security, the session was stopped temporarily.`, '⏱️');
            setHint(`Please click the <b>${GENERATE_QR_HTML}</b> button to generate a new QR.`, 'danger');
        } else {
            setEmpty('Ready to Connect', `The WhatsApp session is empty. Please click the <b>${GENERATE_QR_HTML}</b> button to show the QR Code.`, '🚪');
            setHint(`Click the <b>${GENERATE_QR_HTML}</b> button to start connecting the bot.`, 'warning');
        }
        toggle(btnGenerate, true, 'inline-flex');
        setText(mainDesc, 'The WhatsApp connection needs to be reconnected.');
        return;
    }

    if (connection === 'reconnecting') {
        setBadge('Disconnected', 'disconnected');
        setEmpty('Reconnecting...', 'Connection lost. Trying to reconnect automatically.', '🔄');
        setHint('Please wait a few seconds...', 'warning');
        setText(mainDesc, 'The WhatsApp connection is having issues or needs to be reconnected.');
        return;
    }

    if (connection === 'close' || connection === 'error') {
        setBadge('Disconnected', 'disconnected');
        setEmpty('Connection lost', 'The bot is not connected to WhatsApp right now.', '⚠️');
        setHint('Check the logs for error details.', 'danger');
        setText(mainDesc, 'The WhatsApp connection is having issues or needs to be reconnected.');
        return;
    }

    // 4. STARTING / CONNECTING / WAITING
    setBadge('Waiting', 'waiting');
    if (connection === 'starting') {
        setEmpty('Bot is starting', 'Please wait, the bot is preparing the WhatsApp connection.', '⏳');
        setHint('If it stays in this state too long, check the backend logs or restart the server.', 'warning');
    } else if (connection === 'connecting') {
        setEmpty('Connecting to WhatsApp', 'The bot is trying to establish a connection to the WhatsApp server.', '📡');
        setHint('Please wait a moment. The QR will appear if the session is not yet connected.', 'info');
    } else {
        setEmpty('QR not available yet', 'The QR has not been generated or the bot is not ready to scan.', '📱');
        setHint('Wait until the QR is available. If it does not appear, check the connection status and bot logs.', 'info');
    }
    setText(mainDesc, 'Connect WhatsApp to the bot by scanning the QR from the Linked Devices menu.');
}

// --- Init: Generate QR button ---

export function initQr() {
    const btnGenerate = $('#btnGenerateQr');
    if (!btnGenerate) return;

    btnGenerate.addEventListener('click', async () => {
        const id = store.getCurrent();
        if (!id) return;

        showToast('Preparing QR Code...', 'info');
        btnGenerate.disabled = true;
        btnGenerate.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';

        try {
            await api.start(id);
        } catch (error) {
            showToast(error.message || 'Failed to create QR.', 'error');
            btnGenerate.disabled = false;
            btnGenerate.innerHTML = GENERATE_QR_HTML;
        }
    });
}
