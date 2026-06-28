import { $, formatDate, setText, toggle } from '../core/dom.js';
import { store } from '../core/store.js';
import { api } from '../core/api.js';
import { showToast } from '../ui/toast.js';

const GENERATE_QR_HTML = '<i class="fas fa-qrcode"></i> Generate QR Code';

let qrTimerInterval = null;
let lastEmptyKey = null;

// Putar ulang animasi entrance pada elemen (restart CSS animation via reflow).
function replayAnimation(el) {
    if (!el) return;
    el.style.animation = 'none';
    void el.offsetWidth; // paksa reflow
    el.style.animation = '';
}

// --- Timer countdown QR ---

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
            // Bersihkan QR + set idle agar QR image & timer hilang bersamaan,
            // lalu kartu "QR Kadaluarsa" muncul. Backend juga akan kirim idle.
            store.setStatus({ connection: 'idle', connected: false, message: 'QR Code Kadaluarsa' });
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

        // Animasikan ulang hanya saat state benar-benar berubah (hindari spam).
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
        setEmpty('WhatsApp sudah terhubung', 'Bot sudah connected ke WhatsApp. QR disembunyikan otomatis demi keamanan.', '✅');
        setHint('Bot siap menerima dan mengirim pesan. Kalau ingin scan ulang, logout dulu sesi WhatsApp.', 'success');
        setText(mainDesc, 'WhatsApp sudah berhasil terhubung ke bot.');
        return;
    }

    // 2. QR READY (abaikan QR yang expire-nya sudah lewat agar tidak "muncul lagi")
    if (qrDataUrl && (!expireAt || expireAt > Date.now())) {
        qrImage.src = qrDataUrl;
        qrImage.style.display = 'block';
        qrEmpty.style.display = 'none';
        toggle(btnGenerate, false);
        lastEmptyKey = null;

        if (expireAt && !qrTimerInterval) startQrTimer(expireAt);

        setBadge('QR Ready', 'ready');
        setHint('Silakan scan QR ini dari WhatsApp > Linked Devices. QR bisa berubah otomatis kalau expired.', 'info');
        setText(mainDesc, 'Scan QR berikut untuk menghubungkan WhatsApp ke bot.');
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
        if (status.message === 'QR Code Kadaluarsa') {
            setEmpty('QR Code Kadaluarsa', 'Waktu untuk scan QR (60 detik) sudah habis. Demi keamanan, sesi dihentikan sementara.', '⏱️');
            setHint(`Silakan klik tombol <b>${GENERATE_QR_HTML}</b> untuk men-generate QR yang baru.`, 'danger');
        } else {
            setEmpty('Siap Menghubungkan', `Sesi WhatsApp kosong. Silakan klik tombol <b>${GENERATE_QR_HTML}</b> untuk memunculkan QR Code.`, '🚪');
            setHint(`Klik tombol <b>${GENERATE_QR_HTML}</b> untuk mulai menghubungkan bot.`, 'warning');
        }
        toggle(btnGenerate, true, 'inline-flex');
        setText(mainDesc, 'Koneksi WhatsApp perlu disambungkan ulang.');
        return;
    }

    if (connection === 'reconnecting') {
        setBadge('Disconnected', 'disconnected');
        setEmpty('Menghubungkan ulang...', 'Koneksi terputus. Mencoba reconnect otomatis.', '🔄');
        setHint('Mohon tunggu beberapa detik...', 'warning');
        setText(mainDesc, 'Koneksi WhatsApp sedang bermasalah atau perlu disambungkan ulang.');
        return;
    }

    if (connection === 'close' || connection === 'error') {
        setBadge('Disconnected', 'disconnected');
        setEmpty('Koneksi terputus', 'Bot belum terhubung ke WhatsApp saat ini.', '⚠️');
        setHint('Periksa log untuk detail error.', 'danger');
        setText(mainDesc, 'Koneksi WhatsApp sedang bermasalah atau perlu disambungkan ulang.');
        return;
    }

    // 4. STARTING / CONNECTING / WAITING
    setBadge('Waiting', 'waiting');
    if (connection === 'starting') {
        setEmpty('Bot sedang starting', 'Mohon tunggu, bot sedang menyiapkan koneksi WhatsApp.', '⏳');
        setHint('Jika terlalu lama di status ini, cek log backend atau restart server.', 'warning');
    } else if (connection === 'connecting') {
        setEmpty('Sedang menghubungkan ke WhatsApp', 'Bot sedang mencoba membuat koneksi ke server WhatsApp.', '📡');
        setHint('Tunggu sebentar. QR akan muncul jika sesi belum terhubung.', 'info');
    } else {
        setEmpty('QR belum tersedia', 'QR belum dibuat atau bot belum siap untuk scan.', '📱');
        setHint('Tunggu sampai QR tersedia. Jika tidak muncul, cek status koneksi dan log bot.', 'info');
    }
    setText(mainDesc, 'Hubungkan WhatsApp ke bot dengan scan QR dari menu Linked Devices.');
}

// --- Init: tombol Generate QR ---

export function initQr() {
    const btnGenerate = $('#btnGenerateQr');
    if (!btnGenerate) return;

    btnGenerate.addEventListener('click', async () => {
        const id = store.getCurrent();
        if (!id) return;

        showToast('Menyiapkan QR Code...', 'info');
        btnGenerate.disabled = true;
        btnGenerate.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';

        try {
            await api.start(id);
        } catch (error) {
            showToast(error.message || 'Gagal membuat QR.', 'error');
            btnGenerate.disabled = false;
            btnGenerate.innerHTML = GENERATE_QR_HTML;
        }
    });
}
