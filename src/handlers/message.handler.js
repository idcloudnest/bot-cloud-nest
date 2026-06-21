// Tambahkan getSettings di baris import
import { addLog, notifySessionsUpdate, getSettings } from '../state/app-state.js';
import { getSession, updateSession, clearSession } from '../services/session.service.js';

export async function handleMessage(sock, msg) {
    if (!msg.message || msg.key.fromMe) return;

    const jid = msg.key.remoteJid;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
    if (!text) return;

    // --- 1. CEK SETTINGAN DARI DASHBOARD ---
    const settings = getSettings();
    const isGroup = jid.endsWith('@g.us');

    // Jika pesan dari grup dan Ignore Groups = ON, abaikan pesannya!
    if (isGroup && settings.ignoreGroups) return;

    // Jika pesan jalur pribadi dan Ignore Privates = ON, abaikan pesannya!
    if (!isGroup && settings.ignorePrivates) return;
    // ----------------------------------------

    // addLog('incoming', { jid, text });

    // 2. CEK SESI DI FILE JSON ANDA
    const session = getSession(jid);
    const currentStep = session?.step || 'IDLE';

    let replyMessage = '';

    // 3. LOGIKA FLOW PERCAKAPAN
    switch (currentStep) {
        case 'IDLE':
            if (text.toLowerCase() === 'daftar') {
                updateSession(jid, 'ASK_NAME');
                replyMessage = 'Halo! 👋 Selamat datang. Silakan ketik *Nama Lengkap* Anda:';
            } else {
                replyMessage = 'Ketik *daftar* untuk memulai proses pendaftaran.';
            }
            break;

        case 'ASK_NAME':
            updateSession(jid, 'ASK_EMAIL', { name: text });
            replyMessage = `Baik, Kak *${text}*. \nSelanjutnya, mohon ketikkan *Alamat Email* Anda:`;
            break;

        case 'ASK_EMAIL':
            const savedData = session.data;

            clearSession(jid);

            replyMessage = `✅ *Pendaftaran Berhasil!*\n\nNama: ${savedData.name}\nEmail: ${text}\n\nTerima kasih telah mendaftar!`;
            break;

        default:
            clearSession(jid);
            replyMessage = 'Maaf, terjadi kesalahan sesi. Ketik *daftar* untuk mengulang.';
            break;
    }

    if (replyMessage) {
        await sock.sendMessage(jid, { text: replyMessage });
        addLog('outgoing', { jid, text: replyMessage });
    }

    // 4. REFRESH TABEL DASHBOARD
    notifySessionsUpdate();
}
