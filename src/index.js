import { startBot } from './bot.js';
import { startWebServer } from './web/server.js';

async function main() {
    startWebServer();

    await startBot();
}

main().catch((error) => {
    console.error('App failed to start:', error);
    process.exit(1);
});
