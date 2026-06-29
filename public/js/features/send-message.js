import { $, setText } from '../core/dom.js';
import { store } from '../core/store.js';
import { api } from '../core/api.js';

export function initSendMessage() {
    const form = $('#sendForm');
    if (!form) return;

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const id = store.getCurrent();
        if (!id) return;

        const feedback = $('#sendFeedback');
        setText(feedback, 'Sending...');

        try {
            const result = await api.sendMessage(id, $('#phoneInput').value, $('#messageInput').value);
            setText(feedback, `Message sent to ${result.jid}`);
            $('#messageInput').value = '';
        } catch (error) {
            setText(feedback, error.message || 'Failed to send message.');
        }
    });
}
