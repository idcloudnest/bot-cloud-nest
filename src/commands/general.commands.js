import { config } from '../config.js';

// Always-available commands (not gated by a feature flag).

const ping = {
    name: 'ping',
    usage: '.ping',
    desc: 'Cek apakah bot aktif',
    async handler() {
        return 'Pong! 🏓 Bot aktif.';
    },
};

const help = {
    name: 'help',
    aliases: ['menu', 'cmd', 'commands'],
    usage: '.help',
    desc: 'Tampilkan daftar perintah',
    async handler(ctx) {
        const p = config.commandPrefix;
        const enabled = ctx.commands.filter((c) => !c.feature || ctx.features[c.feature]);

        let text = `╭─── ୨୧ *MENU PERINTAH* ୨୧\n│\n`;

        const general = enabled.filter((c) => !c.feature);
        const group = enabled.filter((c) => c.feature === 'group');

        if (general.length) {
            text += `│  *Umum*\n`;
            for (const c of general) text += `│  ${p}${c.name} — ${c.desc}\n`;
            text += `│\n`;
        }
        if (group.length) {
            text += `│  *Grup* (khusus admin)\n`;
            for (const c of group) text += `│  ${c.usage} — ${c.desc}\n`;
            text += `│\n`;
        }

        // Store feature is a conversation flow, not a command.
        if (ctx.features.store) {
            text += `│  *Toko*\n`;
            text += `│  Ketik *list* untuk lihat produk\n`;
            text += `│\n`;
        }

        text += `╰─── ⋆｡˚ Cloud Nest Bot ⋆｡˚`;
        return text;
    },
};

export const generalCommands = [ping, help];
