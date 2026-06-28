// Wrapper fetch reusable untuk semua endpoint REST.
// Melempar Error dengan pesan dari server bila response tidak ok.

async function request(url, { method = 'GET', body } = {}) {
    const options = { method, headers: {} };

    if (body !== undefined) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    let data = null;
    try {
        data = await response.json();
    } catch {
        // response tanpa body JSON, biarkan null.
    }

    if (!response.ok) {
        throw new Error(data?.error || `Request gagal (${response.status})`);
    }

    return data;
}

export const api = {
    sendMessage: (phone, text) => request('/api/send-message', { method: 'POST', body: { phone, text } }),
    updateSettings: (payload) => request('/api/settings', { method: 'PATCH', body: payload }),
    clearLogs: () => request('/api/logs', { method: 'DELETE' }),
    bulkDeleteLogs: (ids) => request('/api/logs/bulk-delete', { method: 'POST', body: { ids } }),
    resetSession: (jid) => request(`/api/sessions/${encodeURIComponent(jid)}`, { method: 'DELETE' }),
    logout: () => request('/api/logout', { method: 'POST' }),
    restart: () => request('/api/restart', { method: 'POST' }),
    generateQr: () => request('/api/generate-qr', { method: 'POST' }),
};
