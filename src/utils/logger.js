import pino from 'pino';

/**
 * Application logger (separate from Baileys' internal logger, which is silenced).
 * Use this for all console output so it stays consistent and the level can be
 * controlled easily via the LOG_LEVEL env var (default: 'info').
 */
export const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
});

export default logger;
