import { addLog, notifyConversations } from '../state/app-state.js';
import * as conversationRepo from '../db/repositories/conversation.repo.js';
import * as sessionRepo from '../db/repositories/session.repo.js';
import { extractMessageText } from '../utils/formatter.js';
import { isCommand, runCommand } from '../commands/index.js';
import { getBrands, getBrandGroups } from '../services/product-api.js';
import {
    brandListMessage,
    groupListMessage,
    productListMessage,
    productDetailMessage,
} from '../services/product-messages.js';

// Conversation steps for the product catalog flow.
const STEP = {
    BRAND: 'CATALOG_BRAND',     // showing the brand list
    GROUP: 'CATALOG_GROUP',     // showing product groups of a brand
    PRODUCT: 'CATALOG_PRODUCT', // showing products of a group
};

// Words that explicitly open the product catalog (store feature).
const TRIGGERS = new Set([
    'list', 'menu', 'produk', 'product', 'harga', 'katalog', 'order',
]);

const RESET = '#';
const BACK = '0';

/** Parse a 1-based list selection. Returns the 0-based index or -1. */
function parseChoice(text, length) {
    if (!/^\d+$/.test(text)) return -1;
    const n = Number(text);
    return n >= 1 && n <= length ? n - 1 : -1;
}

/** Normalize a reply (string | { text, mentions }) and send it as a quoted reply. */
async function sendReply(sessionId, sock, jid, reply, quoted) {
    if (!reply) return;
    const payload = typeof reply === 'string' ? { text: reply } : reply;
    try {
        await sock.sendMessage(jid, payload, quoted ? { quoted } : undefined);
        // await addLog(sessionId, 'outgoing', { text: payload.text }, jid);
    } catch (error) {
        await addLog(sessionId, 'error', { text: `Failed to send reply: ${error.message}` }, jid);
    }
}

export async function handleMessage(sessionId, sock, msg) {
    if (!msg.message || msg.key.fromMe) return;

    const jid = msg.key.remoteJid;
    const text = extractMessageText(msg);
    if (!text) return;

    // Per-account settings (ignore groups/privates + feature flags).
    const session = await sessionRepo.get(sessionId);
    const settings = session?.settings || {};
    const features = settings.features || { store: true, group: true };
    const isGroup = jid.endsWith('@g.us');
    if (isGroup && settings.ignoreGroups) return;
    if (!isGroup && settings.ignorePrivates) return;

    // await addLog(sessionId, 'incoming', { text }, jid);

    const input = text.trim();

    // 1. Prefixed commands (.help, .kick, ...). Always parsed; feature-gated inside.
    if (isCommand(input)) {
        const reply = await runCommand({ sessionId, sock, msg, jid, isGroup, features }, input);
        await sendReply(sessionId, sock, jid, reply, msg);
        await notifyConversations(sessionId);
        return;
    }

    // 2. Product catalog conversation flow (only if the 'store' feature is on).
    if (features.store) {
        let reply = '';
        try {
            reply = await route({ sessionId, jid, input, lower: input.toLowerCase() });
        } catch (error) {
            await addLog(sessionId, 'error', { text: `Flow error: ${error.message}` }, jid);
            reply = error.message || 'Maaf kak, terjadi kendala. Ketik *#* untuk mulai ulang.';
        }
        await sendReply(sessionId, sock, jid, reply, msg);
    }

    await notifyConversations(sessionId);
}

/** Decide the reply based on the current step + input. Returns the reply text. */
async function route({ sessionId, jid, input, lower }) {
    // Global: reset.
    if (input === RESET) return showBrands(sessionId, jid);

    // Global: trigger words reopen the catalog.
    if (TRIGGERS.has(lower)) return showBrands(sessionId, jid);

    const conversation = await conversationRepo.get(sessionId, jid);
    const step = conversation?.step || 'IDLE';
    const data = conversation?.data || {};

    switch (step) {
        case STEP.BRAND:
            return handleBrandChoice(sessionId, jid, input);
        case STEP.GROUP:
            return handleGroupChoice(sessionId, jid, input, data);
        case STEP.PRODUCT:
            return handleProductChoice(sessionId, jid, input, data);
        default:
            // IDLE / not in a flow and not a trigger: stay silent.
            return '';
    }
}

// --- Step handlers ---

async function showBrands(sessionId, jid) {
    const brands = await getBrands();
    await conversationRepo.upsert(sessionId, jid, STEP.BRAND, {});
    return brandListMessage(brands);
}

async function handleBrandChoice(sessionId, jid, input) {
    const brands = await getBrands();
    const idx = parseChoice(input, brands.length);
    if (idx === -1) return ''; // invalid input -> stay silent
    // if (idx === -1) {
    //     return `Nomor brand tidak valid kak 🙏\n\n${brandListMessage(brands)}`;
    // }

    const brand = brands[idx];
    const groups = await getBrandGroups(brand.id);

    if (!groups.length) {
        return `Maaf kak, produk *${brand.name}* belum tersedia 🙏\n\nKetik *#* untuk kembali ke list brand.`;
    }

    // Single category -> jump straight to its product list.
    if (groups.length === 1) {
        await conversationRepo.upsert(sessionId, jid, STEP.PRODUCT, {
            brandId: brand.id,
            brandName: brand.name,
            groupIndex: 0,
            groupName: groups[0].name,
            singleGroup: true,
        });
        return productListMessage(brand.name, groups[0].name, groups[0].products);
    }

    await conversationRepo.upsert(sessionId, jid, STEP.GROUP, {
        brandId: brand.id,
        brandName: brand.name,
    });
    return groupListMessage(brand.name, groups);
}

async function handleGroupChoice(sessionId, jid, input, data) {
    if (input === BACK) return showBrands(sessionId, jid);

    const groups = await getBrandGroups(data.brandId);
    const idx = parseChoice(input, groups.length);
    if (idx === -1) return ''; // invalid input -> stay silent
    // if (idx === -1) {
    //     return `Nomor jenis produk tidak valid kak 🙏\n\n${groupListMessage(data.brandName, groups)}`;
    // }

    const group = groups[idx];
    await conversationRepo.upsert(sessionId, jid, STEP.PRODUCT, {
        brandId: data.brandId,
        brandName: data.brandName,
        groupIndex: idx,
        groupName: group.name,
        singleGroup: false,
    });
    return productListMessage(data.brandName, group.name, group.products);
}

async function handleProductChoice(sessionId, jid, input, data) {
    if (input === BACK) {
        // Back to the group list, or to brands if the brand only had one group.
        if (data.singleGroup) return showBrands(sessionId, jid);
        const groups = await getBrandGroups(data.brandId);
        await conversationRepo.upsert(sessionId, jid, STEP.GROUP, {
            brandId: data.brandId,
            brandName: data.brandName,
        });
        return groupListMessage(data.brandName, groups);
    }

    const groups = await getBrandGroups(data.brandId);
    const group = groups[data.groupIndex] || { name: data.groupName, products: [] };
    const idx = parseChoice(input, group.products.length);
    if (idx === -1) return ''; // invalid input -> stay silent
    // if (idx === -1) {
    //     return `Nomor produk tidak valid kak 🙏\n\n${productListMessage(data.brandName, group.name, group.products)}`;
    // }

    // Stay on the product step so the user can view another item or go back.
    return productDetailMessage(data.brandName, group.name, group.products[idx]);
}
