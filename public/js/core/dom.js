// Helper DOM kecil yang dipakai di seluruh modul.

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

export function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

export function formatDate(value) {
    if (!value) return '-';
    return new Date(value).toLocaleString('id-ID');
}

/** Set text aman ke elemen kalau ada (null-safe). */
export function setText(el, text) {
    if (el) el.textContent = text;
}

/** Set HTML ke elemen kalau ada (null-safe). */
export function setHtml(el, html) {
    if (el) el.innerHTML = html;
}

/** Tampil/sembunyikan elemen via style.display. */
export function toggle(el, visible, display = 'block') {
    if (el) el.style.display = visible ? display : 'none';
}
