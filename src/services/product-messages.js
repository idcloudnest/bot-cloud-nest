import { config } from '../config.js';

// Builds the WhatsApp text messages for the product catalog flow.
// Decorative, numbered lists with clear navigation hints (more informative
// than a plain price list: counts, price ranges, cut-off windows, SKU, etc).

const STORE = config.productApi.storeName || 'CLOUD NEST STORE';

export function formatRupiah(value) {
    const number = Number(value || 0);
    if (number <= 0) return 'Belum tersedia';
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
    }).format(number);
}

function pad(idx) {
    return String(idx + 1).padStart(2, '0');
}

/** Min/max of available (>0) prices across a product list. */
function priceRange(products = []) {
    const prices = products.map((p) => Number(p.price || 0)).filter((n) => n > 0);
    if (!prices.length) return null;
    return { min: Math.min(...prices), max: Math.max(...prices) };
}

/** Human-friendly cut-off window. */
function cutOffText(product) {
    const s = product.startCutOff;
    const e = product.endCutOff;
    if (!s || !e || (s === '00:00:00' && e === '00:00:00')) return 'Buka 24 jam';
    const hhmm = (t) => String(t).slice(0, 5);
    return `Tutup ${hhmm(s)}–${hhmm(e)}`;
    // return `Tutup ${hhmm(s)}-${hhmm(e)}`;
}

/** Count products across all groups (incl. nested sub-groups, defensively). */
function countProducts(group) {
    const direct = Array.isArray(group.products) ? group.products.length : 0;
    const nested = Array.isArray(group.groups)
        ? group.groups.reduce((sum, g) => sum + countProducts(g), 0)
        : 0;
    return direct + nested;
}

// --- Messages ---

/** Greeting shown when a user first opens the catalog / says hi. */
export function welcomeMessage(brandCount = 0) {
    let text = `╭─── ୨୧ *${STORE}* ୨୧\n`;
    text += `│\n`;
    text += `│  Halo kak! 👋 Selamat datang di\n`;
    text += `│  layanan produk digital kami.\n`;
    text += `│\n`;
    text += `│  Tersedia *${brandCount}* brand siap order:\n`;
    text += `│  pulsa, data, token PLN, e-money,\n`;
    text += `│  voucher game, dan lainnya.\n`;
    text += `│\n`;
    text += `╰─── ⋆｡˚ Menu ⋆｡˚\n\n`;
    text += `Ketik *list* untuk melihat daftar brand.\n`;
    text += `Ketik *#* kapan saja untuk reset.`;
    return text;
}

export function brandListMessage(brands = []) {
    if (!brands.length) {
        return `Maaf kak, untuk saat ini produk masih belum tersedia 🙏`;
    }

    let text = `╭─── ୨୧ *${STORE}* ୨୧\n`;
    text += `│\n`;
    text += `│  *List Brand Digital*\n`;
    text += `│  Total: ${brands.length} brand\n`;
    text += `│`;

    const lines = brands.map((brand, idx) => `│ ${pad(idx)}. ᯓ★ *${brand.name}*`);
    text += '\n' + lines.join('\n');

    text += `\n│\n`;
    text += `╰─── ⋆｡˚ Ketik nomor brand ⋆｡˚\n`;
    text += `Contoh: *1*\n\n`;
    text += `Ketik *#* untuk reset.`;
    return text;
}

export function groupListMessage(brandName, groups = []) {
    if (!groups.length) {
        return `Maaf kak, produk *${brandName}* belum tersedia 🙏`;
    }

    let text = `╭─── ୨୧ *${brandName}* ୨୧\n`;
    text += `│\n`;
    text += `│  *Pilih Jenis Produk*\n`;
    text += `│  ${groups.length} kategori tersedia\n`;
    text += `│`;

    const lines = groups.map((group, idx) => {
        const n = countProducts(group);
        return `│ ${pad(idx)}. ᯓ★ *${group.name}*  _(${n} produk)_`;
    });
    text += '\n' + lines.join('\n');

    text += `\n│\n`;
    text += `╰─── ⋆｡˚ Ketik nomor jenis produk ⋆｡˚\n`;
    text += `Contoh: *1*\n\n`;
    text += `Ketik *0* untuk kembali ke list brand.\n`;
    text += `Ketik *#* untuk reset.`;
    return text;
}

export function productListMessage(brandName, groupName, products = []) {
    const title = groupName ? `${brandName} • ${groupName}` : brandName;
    if (!products.length) {
        return `Maaf kak, produk *${title}* belum tersedia 🙏`;
    }

    let text = `╭─── ୨୧ *${title}* ୨୧\n`;
    text += `│\n`;
    text += `│  *Daftar Harga* (${products.length} produk)\n`;
    text += `│`;

    const lines = products.map((product, idx) => {
        let list = `│ ${pad(idx)}. *${product.name}*\n`;
        list += `│      💰 ${formatRupiah(product.price)}\n`;
        list += `│      🏷️ Kode: ${product.sku || '-'}`;
        return list;
    });
    text += '\n' + lines.join('\n│\n');

    const range = priceRange(products);
    text += `\n│\n`;
    if (range) {
        text += `│  Kisaran harga:\n`;
        text += `│  ${formatRupiah(range.min)} – ${formatRupiah(range.max)}\n`;
        text += `│\n`;
    }
    text += `╰─── ⋆｡˚ ${STORE} ⋆｡˚\n\n`;
    text += `Ketik *nomor produk* untuk lihat detail.\n`;
    text += `Ketik *0* untuk kembali.\n`;
    text += `Ketik *#* untuk reset.`;
    return text;
}

export function productDetailMessage(brandName, groupName, product) {
    let text = `╭─── ୨୧ *DETAIL PRODUK* ୨୧\n`;
    text += `│\n`;
    text += `│  *${product.name}*\n`;
    text += `│\n`;
    text += `│  💰 Harga   : *${formatRupiah(product.price)}*\n`;
    text += `│  🏷️ Kode    : ${product.sku || '-'}\n`;
    text += `│  🏬 Brand   : ${brandName}\n`;
    if (groupName) text += `│  📦 Kategori: ${groupName}\n`;
    if (product.label) text += `│  🔖 Tipe    : ${product.label}\n`;
    text += `│  🕒 Jam     : ${cutOffText(product)}\n`;
    text += `│\n`;
    text += `╰─── ⋆｡˚ ${STORE} ⋆｡˚\n\n`;
    text += `Untuk order kode *${product.sku || '-'}*, hubungi admin ya kak 🙏\n\n`;
    text += `Ketik *0* untuk kembali ke daftar produk.\n`;
    text += `Ketik *#* untuk reset.`;
    return text;
}
