const socket = io();

let logs = [];

const $ = (selector) => document.querySelector(selector);

let qrTimerInterval = null;

function stopQrTimer() {
    if (qrTimerInterval) {
        clearInterval(qrTimerInterval);
        qrTimerInterval = null;
    }
    const container = document.getElementById('qrTimerContainer');
    if (container) {
        container.style.display = 'none';
        container.classList.remove('timer-pulse', 'timer-danger');
    }
}

// Menerima waktu pembuatan (updatedAt) dan batas kadaluarsa (timeoutMs)
function startQrTimer(expireAtMs) {
    stopQrTimer();

    const container = document.getElementById('qrTimerContainer');
    const countText = document.getElementById('qrTimerCount');

    if (!container || !countText || !expireAtMs) return;

    // Cegah timer berjalan jika expireAt sudah kedaluwarsa dari sananya (menghindari bug)
    if (expireAtMs <= Date.now()) return;

    const updateTimer = () => {
        const remainingSec = Math.ceil((expireAtMs - Date.now()) / 1000);

        if (remainingSec <= 0) {
            countText.textContent = "0";
            stopQrTimer();

            // FRONTEND FORCE KILL: Paksa UI kembali memunculkan tombol Generate
            renderStatus({
                connection: 'idle',
                connected: false,
                message: 'QR Code Kadaluarsa'
            });
            return;
        }

        countText.textContent = remainingSec;

        if (remainingSec <= 10) {
            container.classList.remove('timer-pulse');
            container.classList.add('timer-danger');
        } else {
            container.classList.add('timer-pulse');
            container.classList.remove('timer-danger');
        }
    };

    container.style.display = 'inline-flex';
    updateTimer();
    qrTimerInterval = setInterval(updateTimer, 1000);
}

const statusPill = $('#statusPill');
const connectionText = $('#connectionText');
const lastError = $('#lastError');
// const $connectionError = $('#connectionError');
const $startedAt = $('#startedAtValue');
const $serverTime = $('#serverTimeValue');
const logCount = $('#logCount');
const qrImage = $('#qrImage');
const qrEmpty = $('#qrEmpty');
const logsList = $('#logsList');
const sessionsTable = $('#sessionsTable');

const $deviceActions = $('#deviceActions')

const $btnGenerateQr = $('#btnGenerateQr');
const generateQTrText = `<i class="fas fa-qrcode"></i> Generate QR Code`

let latestStatus = {};
let latestQrPayload = null;

function showToast(message, type = 'info') {
    const container = $('#toastContainer');

    if (!container) return;

    const toast = document.createElement('div');

    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('is-visible');
    });

    setTimeout(() => {
        toast.classList.remove('is-visible');

        setTimeout(() => {
            toast.remove();
        }, 200);
    }, 2600);
}

function showConfirmModal(options = {}) {
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
            if (event.target === modal) {
                close(false);
            }
        };

        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                close(false);
            }
        };

        okButton.addEventListener('click', onConfirm);
        cancelButton.addEventListener('click', onCancel);
        modal.addEventListener('click', onBackdropClick);
        document.addEventListener('keydown', onKeyDown);

        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');

        setTimeout(() => {
            okButton.focus();
        }, 80);
    });
}

function formatDate(value) {
    if (!value) return '-';
    return new Date(value).toLocaleString('id-ID');
}

function getStatusClass(connection, connected) {
    const value = String(connection || '').toLowerCase();

    if (connected || value === 'connected' || value === 'open') {
        return 'success';
    }

    if (value === 'qr') {
        return 'info';
    }

    if (value === 'connecting' || value === 'starting' || value === 'reconnecting') {
        return 'warning';
    }

    if (value === 'close' || value === 'logged_out' || value === 'error') {
        return 'danger';
    }

    return 'warning';
}

function getStatusLabel(connection, message) {
    const value = String(connection || '').toLowerCase();

    const labels = {
        starting: 'Starting',
        connecting: 'Connecting',
        qr: 'QR Ready',
        connected: 'Connected',
        open: 'Connected',
        reconnecting: 'Reconnecting',
        logged_out: 'Logged Out',
        close: 'Disconnected',
        error: 'Error',
    };

    return labels[value] || message || connection || 'Unknown';
}

function renderStatus(status = {}) {
    latestStatus = status;

    const connection =
        status.connection ||
        status.message ||
        'unknown';

    const isConnected =
        status.connected === true ||
        connection.toLowerCase() === 'connected' ||
        connection.toLowerCase() === 'open';

    const statusPill = $('#statusPill');
    const statusPillText = $('#statusPillText');
    const statusUpdatedAt = $('#statusUpdatedAt');
    const connectionText = $('#connectionText');
    const startedAtValue = $('#startedAtValue');
    const serverTimeValue = $('#serverTimeValue');


    if (statusPill) {
        statusPill.className = `pill ${isConnected ? 'success' : 'warning'}`;
    }

    if (statusPillText) {
        statusPillText.textContent = connection;
    } else if (statusPill) {
        statusPill.textContent = connection;
    }

    if (statusUpdatedAt) {
        statusUpdatedAt.textContent = status.updatedAt
            ? `Last update: ${formatDate(status.updatedAt)}`
            : 'Last update: -';
    }

    if (connectionText) {
        connectionText.textContent = status.message || connection;
    }

    if (lastError) {
        lastError.textContent = status.lastError || 'No error';
    }

    if (startedAtValue) {
        startedAtValue.textContent = status.startedAt
            ? formatDate(status.startedAt)
            : '-';
    }

    // if (serverTimeValue) {
    //     serverTimeValue.textContent = status.updatedAt
    //         ? formatDate(status.updatedAt)
    //         : 'Server local time';
    // }

    renderQrState();
    renderConnectedDevice(status);
}

function renderQr(payload = null) {
    latestQrPayload = payload;
    renderQrState();
}

function renderQrState() {
    const qrImage = $('#qrImage');
    const qrEmpty = $('#qrEmpty');
    const qrStateBadge = $('#qrStateBadge');
    const qrStateTitle = $('#qrStateTitle');
    const qrStateDescription = $('#qrStateDescription');
    const qrUpdatedAt = $('#qrUpdatedAt');
    const qrHintBox = $('#qrHintBox');
    const qrConnectionText = $('#qrConnectionText');
    const qrStatusUpdatedAt = $('#qrStatusUpdatedAt');
    const qrMainDescription = $('#qrMainDescription');

    if (!qrImage || !qrEmpty) return;

    const status = latestStatus || {};
    const payload = latestQrPayload || {};

    const connection = String(status.connection || '').toLowerCase();
    const connected = Boolean(status.connected);

    const qrDataUrl =
        payload?.qrDataUrl ||
        payload?.qr?.qrDataUrl ||
        (
            typeof payload === 'string' && payload.startsWith('data:image')
                ? payload
                : null
        ) ||
        (
            typeof payload?.qr === 'string' && payload.qr.startsWith('data:image')
                ? payload.qr
                : null
        );

    const updatedAt = payload?.updatedAt || payload?.qr?.updatedAt || null;

    const expireAt = payload?.expireAt || payload?.qr?.expireAt || null;

    const setBadge = (text, type) => {
        if (!qrStateBadge) return;
        qrStateBadge.textContent = text;
        qrStateBadge.className = `qr-state-badge ${type}`;
    };

    const setHint = (text, type) => {
        if (!qrHintBox) return;
        // qrHintBox.textContent = text;
        qrHintBox.innerHTML = text;
        qrHintBox.className = `qr-hint ${type}`;
    };

    const setEmptyContent = (title, description, icon = '📱') => {
        const iconEl = qrEmpty.querySelector('.qr-empty-icon');

        if (iconEl) {
            iconEl.textContent = icon;
        }

        if (qrStateTitle) qrStateTitle.textContent = title;
        // if (qrStateDescription) qrStateDescription.textContent = description;
        if (qrStateDescription) qrStateDescription.innerHTML = description;
    };

    if (qrConnectionText) {
        qrConnectionText.textContent = status.message || status.connection || '-';
    }

    if (qrStatusUpdatedAt) {
        qrStatusUpdatedAt.textContent = status.updatedAt
            ? formatDate(status.updatedAt)
            : '-';
    }

    if (qrUpdatedAt) {
        qrUpdatedAt.textContent = updatedAt
            ? `QR updated: ${formatDate(updatedAt)}`
            : 'QR updated: -';
    }

    // 1. CONNECTED
    if (connected || connection === 'connected' || connection === 'open') {
        stopQrTimer();
        qrImage.removeAttribute('src');
        qrImage.style.display = 'none';
        qrEmpty.style.display = 'grid';

        setBadge('Connected', 'connected');
        setEmptyContent(
            'WhatsApp sudah terhubung',
            'Bot sudah connected ke WhatsApp. QR disembunyikan otomatis demi keamanan.',
            '✅'
        );
        setHint(
            'Bot siap menerima dan mengirim pesan. Kalau ingin scan ulang, logout dulu sesi WhatsApp.',
            'success'
        );

        if (qrMainDescription) {
            qrMainDescription.textContent = 'WhatsApp sudah berhasil terhubung ke bot.';
        }

        return;
    }

    // 2. QR READY
    if (qrDataUrl) {
        qrImage.src = qrDataUrl;
        qrImage.style.display = 'block';
        qrEmpty.style.display = 'none';

        if (expireAt && !qrTimerInterval) {
            startQrTimer(expireAt);
        }

        setBadge('QR Ready', 'ready');
        setHint(
            'Silakan scan QR ini dari WhatsApp > Linked Devices. QR bisa berubah otomatis kalau expired.',
            'info'
        );

        if (qrMainDescription) {
            qrMainDescription.textContent = 'Scan QR berikut untuk menghubungkan WhatsApp ke bot.';
        }

        return;
    }

    // 3. RECONNECTING / DISCONNECTED / ERROR
    if (
        connection === 'reconnecting' ||
        connection === 'close' ||
        connection === 'logged_out' ||
        connection === 'error' ||
        connection === 'idle'
    ) {
        stopQrTimer();
        qrImage.removeAttribute('src');
        qrImage.style.display = 'none';
        qrEmpty.style.display = 'grid';

        if ($btnGenerateQr) {
            $btnGenerateQr.style.display = 'none'; // Sembunyikan default
            $btnGenerateQr.disabled = false;
            $btnGenerateQr.innerHTML = generateQTrText
        }

        setBadge('Disconnected', 'disconnected');

        // Munculkan tombol KHUSUS jika statusnya logged_out atau idle
        if (connection === 'logged_out' || connection === 'idle') {
            if (status.message === 'QR Code Kadaluarsa') {
                setEmptyContent(
                    'QR Code Kadaluarsa',
                    'Waktu untuk scan QR (60 detik) sudah habis. Demi keamanan, sesi dihentikan sementara.',
                    '⏱️'
                );
                setHint(
                    `Silakan klik tombol <b>${generateQTrText}</b> untuk men-generate QR yang baru.`,
                    'danger'
                );
            } else {
                setEmptyContent(
                    'Siap Menghubungkan',
                    `Sesi WhatsApp kosong. Silakan klik tombol <b>${generateQTrText}</b> untuk memunculkan QR Code.`,
                    '🚪'
                );
                setHint(
                    `Klik tombol <b>${generateQTrText}</b> untuk mulai menghubungkan bot.`,
                    'warning'
                );
            }

            if ($btnGenerateQr) $btnGenerateQr.style.display = 'inline-block'; // Tampilkan tombol
        }
        else if (connection === 'reconnecting') {
            setEmptyContent('Menghubungkan ulang...', 'Koneksi terputus. Mencoba reconnect otomatis.', '🔄');
            setHint('Mohon tunggu beberapa detik...', 'warning');
        }
        else {
            setEmptyContent('Koneksi terputus', 'Bot belum terhubung ke WhatsApp saat ini.', '⚠️');
            setHint('Periksa log untuk detail error.', 'danger');
        }

        if (qrMainDescription) qrMainDescription.textContent = 'Koneksi WhatsApp sedang bermasalah atau perlu disambungkan ulang.';
        return;
    }

    if ($btnGenerateQr) $btnGenerateQr.style.display = 'none';

    // 4. STARTING / CONNECTING / WAITING
    qrImage.removeAttribute('src');
    qrImage.style.display = 'none';
    qrEmpty.style.display = 'grid';

    setBadge('Waiting', 'waiting');

    if (connection === 'starting') {
        setEmptyContent(
            'Bot sedang starting',
            'Mohon tunggu, bot sedang menyiapkan koneksi WhatsApp.',
            '⏳'
        );
        setHint(
            'Jika terlalu lama di status ini, cek log backend atau restart server.',
            'warning'
        );
    } else if (connection === 'connecting') {
        setEmptyContent(
            'Sedang menghubungkan ke WhatsApp',
            'Bot sedang mencoba membuat koneksi ke server WhatsApp.',
            '📡'
        );
        setHint(
            'Tunggu sebentar. QR akan muncul jika sesi belum terhubung.',
            'info'
        );
    } else {
        setEmptyContent(
            'QR belum tersedia',
            'QR belum dibuat atau bot belum siap untuk scan.',
            '📱'
        );
        setHint(
            'Tunggu sampai QR tersedia. Jika tidak muncul, cek status koneksi dan log bot.',
            'info'
        );
    }

    if (qrMainDescription) {
        qrMainDescription.textContent = 'Hubungkan WhatsApp ke bot dengan scan QR dari menu Linked Devices.';
    }
}

function renderSettings(settings = {}) {
    const ignoreGroupsInput = $('#ignoreGroupsInput');
    const ignorePrivatesInput = $('#ignorePrivatesInput');
    const logLimitInput = $('#logLimitInput');
    const logLimitText = $('#logLimitText');

    if (ignoreGroupsInput) {
        ignoreGroupsInput.checked = Boolean(settings.ignoreGroups);
    }

    if (ignorePrivatesInput) {
        ignorePrivatesInput.checked = Boolean(settings.ignorePrivates);
    }

    if (logLimitInput) {
        logLimitInput.value = settings.logLimit || 100;
    }

    if (logLimitText) {
        logLimitText.textContent = `Max ${settings.logLimit || 100} logs in memory`;
    }
}

function renderLogs() {
    logCount.textContent = logs.length;

    if (!logs.length) {
        logsList.innerHTML = '<div class="empty">Belum ada log.</div>';
        handleLogSelection(); // Reset tombol
        return;
    }

    logsList.innerHTML = logs.map((log) => {
        return `
      <article class="log-item" style="display: flex; gap: 12px; align-items: flex-start;">
        <div style="padding-top: 2px;">
            <input type="checkbox" class="log-checkbox" value="${log.id}" onchange="handleLogSelection()" style="cursor: pointer; width: 16px; height: 16px;">
        </div>
        <div style="flex: 1;">
            <div class="log-meta">
              <span>${escapeHtml(log.type)} ${log.jid ? `• ${escapeHtml(log.jid)}` : ''}</span>
              <span>${formatDate(log.timestamp)}</span>
            </div>
            <div class="log-text">${escapeHtml(log.payload.text || '')}</div>
        </div>
      </article>
    `;
    }).join('');

    handleLogSelection(); // Refresh status tombol
}

function renderSessions(sessions = []) {
    if (!sessions.length) {
        sessionsTable.innerHTML = `
            <tr>
                <td colspan="4">
                    Belum ada conversation aktif. Session akan muncul setelah user chat dan masuk ke flow bot.
                </td>
            </tr>
        `;
        return;
    }

    sessionsTable.innerHTML = sessions.map((session) => {
        return `
            <tr>
                <td>${escapeHtml(session.jid)}</td>
                <td>${escapeHtml(session.step || '-')}</td>
                <td>${formatDate(session.updatedAt)}</td>
                <td>
                    <button onclick="resetSession('${encodeURIComponent(session.jid)}')">
                        Reset
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}
// function renderSessions(sessions) {
//     if (!sessions.length) {
//         sessionsTable.innerHTML = '<tr><td colspan="4">Belum ada active session.</td></tr>';
//         return;
//     }

//     sessionsTable.innerHTML = sessions.map((session) => {
//         return `
//       <tr>
//         <td>${escapeHtml(session.jid)}</td>
//         <td>${escapeHtml(session.step || '-')}</td>
//         <td>${formatDate(session.updatedAt)}</td>
//         <td><button onclick="resetSession('${encodeURIComponent(session.jid)}')">Reset</button></td>
//       </tr>
//     `;
//     }).join('');
// }

async function resetSession(encodedJid) {
    const jid = decodeURIComponent(encodedJid);
    await fetch(`/api/sessions/${encodeURIComponent(jid)}`, { method: 'DELETE' });
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function renderConnectedDevice(status = {}) {
    const device = status.device || null;
    const isConnected = Boolean(status.connected && device);

    const deviceStatusBadge = $('#deviceStatusBadge');
    const deviceCard = $('#deviceCard');
    const deviceName = $('#deviceName');
    const deviceDescription = $('#deviceDescription');
    const deviceId = $('#deviceId');
    const devicePlatform = $('#devicePlatform');
    const deviceConnectedAt = $('#deviceConnectedAt');

    if (deviceStatusBadge) {
        deviceStatusBadge.textContent = isConnected ? 'Connected' : 'Not Connected';
        deviceStatusBadge.className = `device-badge ${isConnected ? 'connected' : 'disconnected'}`;
    }

    if (deviceCard) {
        deviceCard.className = `device-card ${isConnected ? '' : 'is-empty'}`;
    }

    if (!isConnected) {
        if (deviceName) {
            deviceName.textContent = 'Belum ada device connected';
        }

        if (deviceDescription) {
            deviceDescription.textContent = 'Scan QR WhatsApp untuk menghubungkan device ke bot.';
        }

        if (deviceId) deviceId.textContent = '-';
        if (devicePlatform) devicePlatform.textContent = '-';
        if (deviceConnectedAt) deviceConnectedAt.textContent = '-';

        // if (document.getElementById('deviceActions')) {
        //     document.getElementById('deviceActions').style.display = 'none';
        // }
        if ($deviceActions) {
            $deviceActions.style.display = 'none';
        }

        return;
    }

    const displayName =
        device.verifiedName ||
        device.name ||
        'WhatsApp Device';

    const displayId =
        device.id ||
        device.lid ||
        '-';

    if (deviceName) {
        deviceName.textContent = displayName;
    }

    if (deviceDescription) {
        deviceDescription.textContent = 'Device ini sedang aktif dan dipakai bot untuk menerima/mengirim pesan.';
    }

    if (deviceId) {
        deviceId.textContent = displayId;
    }

    if (devicePlatform) {
        devicePlatform.textContent = device.platform || 'WhatsApp';
    }

    if (deviceConnectedAt) {
        deviceConnectedAt.textContent = device.connectedAt
            ? formatDate(device.connectedAt)
            : '-';
    }

    if ($deviceActions) {
        $deviceActions.style.display = 'flex';
    }
}

$('#sendForm').addEventListener('submit', async (event) => {
    event.preventDefault();

    const feedback = $('#sendFeedback');
    feedback.textContent = 'Mengirim...';

    const response = await fetch('/api/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            phone: $('#phoneInput').value,
            text: $('#messageInput').value
        })
    });

    const result = await response.json();

    if (!response.ok) {
        feedback.textContent = result.error || 'Gagal mengirim pesan.';
        return;
    }

    feedback.textContent = `Pesan terkirim ke ${result.jid}`;
    $('#messageInput').value = '';
});

$('#settingsForm').addEventListener('submit', async (event) => {
    event.preventDefault();

    const logLimit = Number($('#logLimitInput').value || 100);

    if (logLimit < 10 || logLimit > 1000) {
        showToast('Log limit harus antara 10 sampai 1000.', 'error');
        return;
    }

    try {
        const response = await fetch('/api/settings', {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                ignoreGroups: $('#ignoreGroupsInput').checked,
                ignorePrivates: $('#ignorePrivatesInput').checked,
                logLimit,
            }),
        });

        const result = await response.json();

        if (!response.ok) {
            showToast(result.error || 'Gagal update settings.', 'error');
            return;
        }

        renderSettings(result);
        markSettingsSaved();
        showToast(`Settings tersimpan. Log limit: ${result.logLimit}.`, 'success');
    } catch (error) {
        showToast('Gagal update settings.', 'error');
    }
});

$('#clearLogsButton').addEventListener('click', async () => {
    const confirmed = await showConfirmModal({
        title: 'Clear message logs?',
        message: 'Semua log yang tampil di dashboard akan dibersihkan. Chat WhatsApp asli tidak akan terhapus.',
        confirmText: 'Ya, clear logs',
        cancelText: 'Batal',
    });

    if (!confirmed) return;

    showToast('Membersihkan logs...', 'info');

    try {
        const response = await fetch('/api/logs', {
            method: 'DELETE',
        });

        const result = await response.json();

        if (!response.ok) {
            showToast(result.error || 'Gagal clear logs.', 'error');
            return;
        }

        logs = [];
        renderLogs();

        showToast(`${result.clearedCount || 0} log berhasil dibersihkan.`, 'success');
    } catch (error) {
        showToast('Gagal clear logs.', 'error');
    }

    // const feedback = $('#logsFeedback');

    // if (!confirm('Clear semua log yang tampil di dashboard?')) {
    //     return;
    // }

    // feedback.textContent = 'Membersihkan logs...';

    // try {
    //     const response = await fetch('/api/logs', {
    //         method: 'DELETE',
    //     });

    //     const result = await response.json();

    //     if (!response.ok) {
    //         feedback.textContent = result.error || 'Gagal clear logs.';
    //         return;
    //     }

    //     logs = [];
    //     renderLogs();

    //     feedback.textContent = `${result.clearedCount || 0} log berhasil dibersihkan.`;
    // } catch (error) {
    //     feedback.textContent = 'Gagal clear logs.';
    // }
});

const saveSettingsButton = $('#saveSettingsButton');

function markSettingsDirty() {
    if (!saveSettingsButton) return;

    saveSettingsButton.disabled = false;
    saveSettingsButton.textContent = 'Save Settings';
}

function markSettingsSaved() {
    if (!saveSettingsButton) return;

    saveSettingsButton.disabled = true;
    saveSettingsButton.textContent = 'Saved ✓';
}

['#ignoreGroupsInput', '#ignorePrivatesInput', '#logLimitInput'].forEach((selector) => {
    const el = $(selector);
    if (!el) return;

    el.addEventListener('input', markSettingsDirty);
    el.addEventListener('change', markSettingsDirty);
});


// Fungsi untuk update UI Topbar Status
function updateTopbarStatus(connectionState, lastUpdateDate) {
    const pill = document.getElementById('statusPill');
    const pillText = document.getElementById('statusPillText');
    const icon = document.getElementById('statusIcon');
    const updatedAt = document.getElementById('statusUpdatedAt');

    // Reset semua class statis
    pill.className = 'pill';
    icon.className = '';

    // Tentukan tampilan berdasarkan state
    if (connectionState === 'open') {
        pill.classList.add('status-online');
        icon.className = 'fas fa-check-circle';
        pillText.textContent = 'Connected';
    } else if (connectionState === 'connecting') {
        pill.classList.add('status-warning');
        icon.className = 'fas fa-circle-notch fa-spin'; // Animasi muter
        pillText.textContent = 'Connecting...';
    } else if (connectionState === 'waiting_qr') {
        pill.classList.add('status-warning');
        icon.className = 'fas fa-qrcode';
        pillText.textContent = 'Waiting QR';
    } else {
        pill.classList.add('status-offline');
        icon.className = 'fas fa-times-circle';
        pillText.textContent = 'Disconnected';
    }

    // Update waktu (Format: 20/6/2026, 22.26.12)
    if (lastUpdateDate) {
        const dateObj = new Date(lastUpdateDate);
        const formattedTime = dateObj.toLocaleString('id-ID', {
            day: 'numeric', month: 'numeric', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        }).replace(/:/g, '.'); // Ganti titik dua jadi titik biar pas format Indo

        updatedAt.innerHTML = `<i class="fas fa-clock"></i> Last update: ${formattedTime}`;
    }
}
// socket.on('state', (state) => updateTopbarStatus(state.connection, state.lastStatusUpdate));
socket.on('status', (status) => {
    updateTopbarStatus(status.connection, status.updatedAt)
    renderStatus(status)
});
socket.on('qr', (payload) => renderQr(payload));
socket.on('settings', renderSettings);
socket.on('sessions', renderSessions);

socket.on('logs:init', (items) => {
    logs = items;
    renderLogs();
});
socket.on('log', (item) => {
    const limit = Number($('#logLimitInput')?.value || 100);

    logs.unshift(item);
    logs = logs.slice(0, limit);

    renderLogs();
});
socket.on('logs:clear', (payload) => {
    logs = [];
    renderLogs();

    const feedback = $('#logsFeedback');

    if (feedback) {
        feedback.textContent = `${payload.clearedCount || 0} log berhasil dibersihkan.`;
    }
});
socket.on('logs:deleted_multiple', (payload) => {
    // Filter/buang semua log yang ID-nya ada di array payload.ids
    logs = logs.filter((l) => !payload.ids.includes(l.id));
    renderLogs();
});

// Menampilkan/menyembunyikan tombol "Hapus Terpilih"
window.handleLogSelection = () => {
    const selected = document.querySelectorAll('.log-checkbox:checked');
    const btn = document.getElementById('btnDeleteSelected');

    if (!btn) return;

    if (selected.length > 0) {
        btn.style.display = 'inline-flex';
        btn.querySelector('span').textContent = selected.length;
    } else {
        btn.style.display = 'none';
    }
};

// Eksekusi ketika tombol "Hapus Terpilih" diklik
document.getElementById('btnDeleteSelected')?.addEventListener('click', async () => {
    // Kumpulkan semua value (ID log) dari checkbox yang dicentang
    const selectedIds = Array.from(document.querySelectorAll('.log-checkbox:checked')).map(cb => cb.value);

    if (!selectedIds.length) return;

    const confirmed = await showConfirmModal({
        title: 'Hapus Log Terpilih?',
        message: `Anda akan menghapus ${selectedIds.length} log dari layar. Lanjutkan?`,
        confirmText: 'Ya, Hapus',
    });

    if (!confirmed) return;

    try {
        const response = await fetch('/api/logs/bulk-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: selectedIds })
        });


        if (!response.ok) throw new Error('Gagal menghapus log');
    } catch (error) {
        showToast(error.message, 'error');
    }
});

window.resetSession = resetSession;

// --- ACTION DEVICE: RESTART & DISCONNECT ---
const btnRestartDevice = $('#btnRestartDevice');
const btnDisconnectDevice = $('#btnDisconnectDevice');

if (btnRestartDevice) {
    btnRestartDevice.addEventListener('click', async () => {
        const confirmed = await showConfirmModal({
            title: 'Restart Bot?',
            message: 'Bot akan diputus sementara dan mencoba terhubung kembali. Sesi WA tidak akan dihapus (tidak perlu scan QR ulang).',
            confirmText: 'Ya, Restart',
        });
        if (!confirmed) return;

        showToast('Merestart bot...', 'info');
        try {
            const response = await fetch('/api/restart', { method: 'POST' });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            showToast('Perintah restart berhasil dikirim.', 'success');
        } catch (error) {
            showToast(error.message || 'Gagal merestart bot.', 'error');
        }
    });
}

if (btnDisconnectDevice) {
    btnDisconnectDevice.addEventListener('click', async () => {
        const confirmed = await showConfirmModal({
            title: 'Disconnect (Logout)?',
            message: 'Akses ke akun WhatsApp ini akan dicabut sepenuhnya. Anda harus scan QR lagi untuk menghubungkan bot.',
            confirmText: 'Ya, Logout',
        });
        if (!confirmed) return;

        showToast('Melogout device...', 'warning');
        try {
            const response = await fetch('/api/logout', { method: 'POST' });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            showToast('Berhasil logout dari device.', 'success');
        } catch (error) {
            showToast(error.message || 'Gagal logout device.', 'error');
        }
    });
}

// --- ACTION GENERATE QR ---

if ($btnGenerateQr) {
    $btnGenerateQr.addEventListener('click', async () => {
        showToast('Menyiapkan QR Code...', 'info');
        $btnGenerateQr.disabled = true;
        $btnGenerateQr.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';

        try {
            const response = await fetch('/api/generate-qr', { method: 'POST' });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
        } catch (error) {
            showToast(error.message || 'Gagal membuat QR.', 'error');
            $btnGenerateQr.disabled = false;
            $btnGenerateQr.innerHTML = '<i class="fas fa-qrcode"></i> Generate QR Code';
        }
    });
}
