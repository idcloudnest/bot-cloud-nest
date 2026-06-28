import { startWebServer } from './web/server.js';
import { migrate } from './db/migrate.js';
import { resumeSessions } from './whatsapp/session-manager.js';
import { logger } from './utils/logger.js';

async function main() {
    // 1. Siapkan database (buat tabel bila belum ada).
    await migrate();

    // 2. Jalankan web server + dashboard.
    startWebServer();

    // 3. Resume akun yang sudah punya sesi WhatsApp tersimpan.
    await resumeSessions();
}

main().catch((error) => {
    logger.error(error, 'App failed to start');
    process.exit(1);
});
