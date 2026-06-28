import { addLog, notifyConversations } from '../state/app-state.js';
import * as conversationRepo from '../db/repositories/conversation.repo.js';
import * as sessionRepo from '../db/repositories/session.repo.js';
import { extractMessageText } from '../utils/formatter.js';

export async function handleMessage(sessionId, sock, msg) {
    if (!msg.message || msg.key.fromMe) return;

    const jid = msg.key.remoteJid;
    const text = extractMessageText(msg);
    if (!text) return;

    // 1. Cek setting per akun (ignore groups/privates).
    const session = await sessionRepo.get(sessionId);
    const settings = session?.settings || {};
    const isGroup = jid.endsWith('@g.us');

    if (isGroup && settings.ignoreGroups) return;
    if (!isGroup && settings.ignorePrivates) return;

    // Catat pesan masuk (untuk statistik dashboard).
    await addLog(sessionId, 'incoming', { text }, jid);

    // 2. Ambil state percakapan dari DB.
    const conversation = await conversationRepo.get(sessionId, jid);
    const currentStep = conversation?.step || 'IDLE';

    let replyMessage = '';

    // 3. Flow percakapan (contoh: pendaftaran).
    switch (currentStep) {
        case 'IDLE':
            if (text.toLowerCase() === 'daftar') {
                await conversationRepo.upsert(sessionId, jid, 'ASK_NAME', {});
                replyMessage = 'Halo! 👋 Selamat datang. Silakan ketik *Nama Lengkap* Anda:';
            } else {
                replyMessage = 'Ketik *daftar* untuk memulai proses pendaftaran.';
            }
            break;

        case 'ASK_NAME':
            await conversationRepo.upsert(sessionId, jid, 'ASK_EMAIL', { name: text });
            replyMessage = `Baik, Kak *${text}*. \nSelanjutnya, mohon ketikkan *Alamat Email* Anda:`;
            break;

        case 'ASK_EMAIL': {
            const savedData = conversation.data || {};
            await conversationRepo.remove(sessionId, jid);
            replyMessage = `✅ *Pendaftaran Berhasil!*\n\nNama: ${savedData.name}\nEmail: ${text}\n\nTerima kasih telah mendaftar!`;
            break;
        }

        default:
            await conversationRepo.remove(sessionId, jid);
            replyMessage = 'Maaf, terjadi kesalahan sesi. Ketik *daftar* untuk mengulang.';
            break;
    }

    if (replyMessage) {
        try {
            await sock.sendMessage(jid, { text: replyMessage });
            await addLog(sessionId, 'outgoing', { text: replyMessage }, jid);
        } catch (error) {
            await addLog(sessionId, 'error', { text: `Gagal kirim balasan: ${error.message}` }, jid);
        }
    }

    // 4. Refresh tabel conversations di dashboard.
    await notifyConversations(sessionId);
}
