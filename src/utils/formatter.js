export function formatRupiah(value) {
  return `Rp${Number(value || 0).toLocaleString('id-ID')}`;
}

export function extractMessageText(message) {
  return (
    message.message?.conversation ||
    message.message?.extendedTextMessage?.text ||
    message.message?.imageMessage?.caption ||
    message.message?.videoMessage?.caption ||
    ''
  ).trim();
}

export function normalizePhoneToJid(phone) {
  const digits = String(phone || '').replace(/\D/g, '');

  if (!digits) {
    throw new Error('WhatsApp number is required.');
  }

  let normalized = digits;

  if (normalized.startsWith('0')) {
    normalized = `62${normalized.slice(1)}`;
  }

  if (!normalized.startsWith('62')) {
    throw new Error('Use an Indonesian number, e.g. 6281234567890.');
  }

  return `${normalized}@s.whatsapp.net`;
}
