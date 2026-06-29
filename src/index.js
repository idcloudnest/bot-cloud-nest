import { startWebServer } from './web/server.js';
import { migrate } from './db/migrate.js';
import { seedSuperadmin } from './web/auth.js';
import { resumeSessions } from './whatsapp/session-manager.js';
import { logger } from './utils/logger.js';

async function main() {
    // 1. Prepare the database (create tables if they don't exist yet).
    await migrate();

    // 2. Ensure a superadmin account exists (seeded from env).
    await seedSuperadmin();

    // 3. Start the web server + dashboard.
    startWebServer();

    // 4. Resume accounts that already have a stored WhatsApp session.
    await resumeSessions();
}

main().catch((error) => {
    logger.error(error, 'App failed to start');
    process.exit(1);
});
