import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { generalCommands } from './general.commands.js';
import { groupCommands } from './group.commands.js';
import { senderJid, targetJids, botJid, getGroupContext } from './wa-helpers.js';

// Command registry + dispatcher. Bot commands are prefixed (default ".").
// Each command may be gated by a feature flag and require group/admin context.

const ALL_COMMANDS = [...generalCommands, ...groupCommands];

const byName = new Map();
for (const cmd of ALL_COMMANDS) {
    byName.set(cmd.name, cmd);
    for (const alias of cmd.aliases || []) byName.set(alias, cmd);
}

const PREFIX = config.commandPrefix;

/** Does this text look like a command (starts with the prefix + a letter)? */
export function isCommand(text) {
    return typeof text === 'string' && text.startsWith(PREFIX) && /^[a-zA-Z]/.test(text.slice(PREFIX.length));
}

/**
 * Parse + run a command. Returns a reply (string | { text, mentions }) or null.
 * `features` is the per-bot feature flags object.
 */
export async function runCommand({ sessionId, sock, msg, jid, isGroup, features }, text) {
    const body = text.slice(PREFIX.length).trim();
    const [rawName, ...args] = body.split(/\s+/);
    const name = rawName.toLowerCase();

    const command = byName.get(name);
    if (!command) {
        // Unknown command: stay silent (only respond to real commands).
        return null;
    }

    // Feature gate: a disabled feature means the command doesn't exist for
    // this bot, so we stay silent rather than replying.
    if (command.feature && !features[command.feature]) {
        return null;
    }

    // Group-only gate.
    if (command.groupOnly && !isGroup) {
        return 'Perintah ini hanya bisa dipakai di dalam grup.';
    }

    const ctx = {
        sessionId,
        sock,
        msg,
        jid,
        isGroup,
        features,
        prefix: PREFIX,
        commands: ALL_COMMANDS,
        args,
        argText: args.join(' '),
        sender: senderJid(msg),
        targets: targetJids(msg),
        botJid: botJid(sock),
        group: null,
    };

    console.log(ctx);


    // Resolve group context + admin checks when needed.
    if (isGroup && (command.adminOnly || command.botAdmin)) {
        try {
            ctx.group = await getGroupContext(sock, jid);
        } catch (error) {
            logger.error(error, 'failed to load group metadata');
            return 'Gagal membaca data grup. Coba lagi sebentar lagi ya.';
        }

        if (command.botAdmin && !ctx.group.isAdmin(ctx.botJid)) {
            return 'Jadikan bot sebagai *admin grup* dulu supaya perintah ini bisa jalan 🙏';
        }
        if (command.adminOnly && !ctx.group.isAdmin(ctx.sender)) {
            return 'Perintah ini khusus *admin grup*.';
        }
    } else if (isGroup) {
        // Commands that don't need admin still get group context for mentions/checks.
        try {
            ctx.group = await getGroupContext(sock, jid);
        } catch {
            ctx.group = null;
        }
    }

    try {
        return await command.handler(ctx);
    } catch (error) {
        logger.error({ err: error, command: name }, 'command handler failed');
        return `Gagal menjalankan *${PREFIX}${name}*: ${error.message}`;
    }
}
