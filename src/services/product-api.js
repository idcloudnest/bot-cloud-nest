import axios from 'axios';

import { config } from '../config.js';
import { logger } from '../utils/logger.js';

// HTTP client for the Cloud Nest Store catalog API (idcloudnest /api/cns).
// Discovered endpoints:
//   GET /api/cns/brand-list                  -> { meta, data: [{ id, name }] }
//   GET /api/cns/product-list?brand_id=ID    -> { meta, data: [{ name, products: [...] }] }
const api = axios.create({
    baseURL: `${config.productApi.baseUrl}/api/cns`,
    timeout: config.productApi.timeout,
    headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(config.productApi.token ? { Authorization: `Bearer ${config.productApi.token}` } : {}),
    },
});

/** Low-level GET helper. Returns the parsed response body (`{ meta, data }`). */
export async function getApi(path, params = {}) {
    try {
        const response = await api.get(path, { params });
        return response.data;
    } catch (error) {
        logger.error({
            path,
            status: error.response?.status,
            data: error.response?.data,
            message: error.message,
        }, 'product-api request failed');
        throw new Error('Layanan produk sedang tidak tersedia. Coba lagi sebentar lagi ya kak 🙏');
    }
}

// --- Tiny in-memory TTL cache (per process) ---

const cache = new Map(); // key -> { value, expires }

async function cached(key, loader) {
    const ttl = config.productApi.cacheTtlMs;
    if (ttl > 0) {
        const hit = cache.get(key);
        if (hit && hit.expires > Date.now()) return hit.value;
    }
    const value = await loader();
    if (ttl > 0) cache.set(key, { value, expires: Date.now() + ttl });
    return value;
}

/** Clear the catalog cache (e.g. on demand). */
export function clearCatalogCache() {
    cache.clear();
}

// --- High-level helpers ---

/** All brands: [{ id, name }]. */
export async function getBrands() {
    return cached('brands', async () => {
        const body = await getApi('/brand-list');
        const list = Array.isArray(body?.data) ? body.data : [];
        // Stable, friendly ordering by name.
        return list
            .map((b) => ({ id: b.id, name: String(b.name || '').trim() }))
            .filter((b) => b.id != null && b.name)
            .sort((a, b) => a.name.localeCompare(b.name, 'id'));
    });
}

/**
 * Product groups for a brand: [{ name, products: [normalizedProduct] }].
 * Each product is normalized to a consistent shape.
 */
export async function getBrandGroups(brandId) {
    return cached(`groups:${brandId}`, async () => {
        const body = await getApi('/product-list', { brand_id: brandId });
        const groups = Array.isArray(body?.data) ? body.data : [];
        return groups.map((g) => ({
            name: String(g.name || 'Lainnya').trim(),
            products: (Array.isArray(g.products) ? g.products : []).map(normalizeProduct),
        }));
    });
}

/** Normalize one raw product into the shape used by the message builders. */
function normalizeProduct(p) {
    return {
        id: p.id,
        brandId: p.brand_id,
        name: String(p.product_name || '').trim(),
        price: Number(p.selling_price || 0),
        sku: String(p.buyer_sku_code || '').trim(),
        label: String(p.label || '').trim(),
        startCutOff: p.start_cut_off || null,
        endCutOff: p.end_cut_off || null,
    };
}
