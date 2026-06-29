import { addLog, notifyConversations } from '../state/app-state.js';
import * as conversationRepo from '../db/repositories/conversation.repo.js';
import * as sessionRepo from '../db/repositories/session.repo.js';
import { extractMessageText } from '../utils/formatter.js';

export async function handleMessage(sessionId, sock, msg) {
    if (!msg.message || msg.key.fromMe) return;

    const jid = msg.key.remoteJid;
    const text = extractMessageText(msg);
    if (!text) return;

    // 1. Check per-account settings (ignore groups/privates).
    const session = await sessionRepo.get(sessionId);
    const settings = session?.settings || {};
    const isGroup = jid.endsWith('@g.us');

    if (isGroup && settings.ignoreGroups) return;
    if (!isGroup && settings.ignorePrivates) return;

    // Record the incoming message (for dashboard statistics).
    await addLog(sessionId, 'incoming', { text }, jid);

    // 2. Load the conversation state from the DB.
    const conversation = await conversationRepo.get(sessionId, jid);
    const currentStep = conversation?.step || 'IDLE';

    let replyMessage = '';

    // 3. Conversation flow (example: registration).
    switch (currentStep) {
        case 'IDLE':
            if (text.toLowerCase() === 'register') {
                await conversationRepo.upsert(sessionId, jid, 'ASK_NAME', {});
                replyMessage = 'Hello! 👋 Welcome. Please type your *Full Name*:';
            } else {
                replyMessage = 'Type *register* to start the registration process.';
            }
            break;

        case 'ASK_NAME':
            await conversationRepo.upsert(sessionId, jid, 'ASK_EMAIL', { name: text });
            replyMessage = `Alright, *${text}*. \nNext, please type your *Email Address*:`;
            break;

        case 'ASK_EMAIL': {
            const savedData = conversation.data || {};
            await conversationRepo.remove(sessionId, jid);
            replyMessage = `✅ *Registration Successful!*\n\nName: ${savedData.name}\nEmail: ${text}\n\nThank you for registering!`;
            break;
        }

        default:
            await conversationRepo.remove(sessionId, jid);
            replyMessage = 'Sorry, a session error occurred. Type *register* to start over.';
            break;
    }

    if (replyMessage) {
        try {
            await sock.sendMessage(jid, { text: replyMessage });
            await addLog(sessionId, 'outgoing', { text: replyMessage }, jid);
        } catch (error) {
            await addLog(sessionId, 'error', { text: `Failed to send reply: ${error.message}` }, jid);
        }
    }

    // 4. Refresh the conversations table in the dashboard.
    await notifyConversations(sessionId);
}
