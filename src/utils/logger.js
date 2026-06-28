import pino from 'pino';

/**
 * Logger aplikasi (terpisah dari logger internal Baileys yang di-silent).
 * Pakai ini untuk semua output ke console agar konsisten & mudah diatur level-nya
 * lewat env LOG_LEVEL (default: 'info').
 */
export const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
});

export default logger;
