import { startBot } from './bot.js';
import { startWebServer } from './web/server.js';

import fs from 'node:fs';
import { setStatus } from './state/app-state.js';

async function main() {
    startWebServer();

    // Cek apakah ada sesi WA sebelumnya (creds.json terisi)
    let hasSession = false;
    try {
        const credsPath = './auth_info_baileys/creds.json';
        if (fs.existsSync(credsPath)) {
            const creds = fs.readFileSync(credsPath, 'utf8');
            if (creds.length > 20 && creds !== '{}') hasSession = true;
        }
    } catch (e) {}

    // Jika ada sesi lama, langsung jalankan bot
    if (hasSession) {
        await startBot();
    } else {
        // Jika kosong, ubah status ke IDLE (Menunggu instruksi)
        setStatus({
            connection: 'idle',
            connected: false,
            message: 'Bot standby. Silakan klik Generate QR.',
        });
    }
}

main().catch((error) => {
    console.error('App failed to start:', error);
    process.exit(1);
});
