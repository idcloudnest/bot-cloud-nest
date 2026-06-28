// Wrapper fetch reusable untuk semua endpoint REST.
// Semua endpoint detail di-scope per akun: /api/sessions/:id/...

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
        // tanpa body JSON
    }

    if (!response.ok) {
        throw new Error(data?.error || `Request gagal (${response.status})`);
    }
    return data;
}

const base = (id) => `/api/sessions/${encodeURIComponent(id)}`;

export const api = {
    // Akun
    listSessions: () => request('/api/sessions'),
    dashboard: (days = 14) => request(`/api/dashboard?days=${encodeURIComponent(days)}`),
    paginateSessions: ({ page = 1, pageSize = 10, search = '', status = '' } = {}) => {
        const qs = new URLSearchParams({ page, pageSize });
        if (search) qs.set('search', search);
        if (status) qs.set('status', status);
        return request(`/api/sessions/paginated?${qs.toString()}`);
    },
    createSession: (id, name) => request('/api/sessions', { method: 'POST', body: { id, name } }),
    getSession: (id) => request(base(id)),
    deleteSession: (id) => request(base(id), { method: 'DELETE' }),

    // Koneksi
    start: (id) => request(`${base(id)}/start`, { method: 'POST' }),
    restart: (id) => request(`${base(id)}/restart`, { method: 'POST' }),
    logout: (id) => request(`${base(id)}/logout`, { method: 'POST' }),
    sendMessage: (id, phone, text) => request(`${base(id)}/send-message`, { method: 'POST', body: { phone, text } }),

    // Settings
    updateSettings: (id, payload) => request(`${base(id)}/settings`, { method: 'PATCH', body: payload }),

    // Logs
    clearLogs: (id) => request(`${base(id)}/logs`, { method: 'DELETE' }),
    bulkDeleteLogs: (id, ids) => request(`${base(id)}/logs/bulk-delete`, { method: 'POST', body: { ids } }),

    // Conversations
    resetConversation: (id, jid) => request(`${base(id)}/conversations/${encodeURIComponent(jid)}`, { method: 'DELETE' }),
};
