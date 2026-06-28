import { startBot } from './bot.js';
import { startWebServer } from './web/server.js';

import fs from 'node:fs';
import { setStatus } from './state/app-state.js';
import { logger } from './utils/logger.js';

const CREDS_PATH = './auth_info_baileys/creds.json';

/** Cek apakah ada sesi WhatsApp sebelumnya (creds.json terisi). */
function hasExistingSession() {
    try {
        if (!fs.existsSync(CREDS_PATH)) return false;
        const creds = fs.readFileSync(CREDS_PATH, 'utf8');
        return creds.length > 20 && creds !== '{}';
    } catch {
        return false;
    }
}

async function main() {
    startWebServer();

    if (hasExistingSession()) {
        // Ada sesi lama, langsung jalankan bot.
        await startBot();
    } else {
        // Sesi kosong, set status IDLE (menunggu instruksi user).
        setStatus({
            connection: 'idle',
            connected: false,
            message: 'Bot standby. Silakan klik Generate QR.',
        });
    }
}

main().catch((error) => {
    logger.error(error, 'App failed to start');
    process.exit(1);
});
