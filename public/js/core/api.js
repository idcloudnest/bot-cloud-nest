// Reusable fetch wrapper for all REST endpoints.
// All detail endpoints are scoped per account: /api/sessions/:id/...

async function request(url, { method = 'GET', body } = {}) {
    const options = { method, headers: {} };
    if (body !== undefined) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    // Session expired / not authenticated -> back to login.
    if (response.status === 401) {
        window.location.href = '/login';
        throw new Error('Authentication required.');
    }

    let data = null;
    try {
        data = await response.json();
    } catch {
        // no JSON body
    }

    if (!response.ok) {
        throw new Error(data?.error || `Request failed (${response.status})`);
    }
    return data;
}

const base = (id) => `/api/sessions/${encodeURIComponent(id)}`;

export const api = {
    // Account
    listSessions: () => request('/api/sessions'),
    dashboard: (days = 14) => request(`/api/dashboard?days=${encodeURIComponent(days)}`),
    paginateSessions: ({ page = 1, pageSize = 10, search = '', status = '' } = {}) => {
        const qs = new URLSearchParams({ page, pageSize });
        if (search) qs.set('search', search);
        if (status) qs.set('status', status);
        return request(`/api/sessions/paginated?${qs.toString()}`);
    },
    createSession: (name) => request('/api/sessions', { method: 'POST', body: { name } }),
    renameSession: (id, name) => request(base(id), { method: 'PATCH', body: { name } }),
    getSession: (id) => request(base(id)),
    deleteSession: (id) => request(base(id), { method: 'DELETE' }),

    // Connection
    start: (id) => request(`${base(id)}/start`, { method: 'POST' }),
    restart: (id) => request(`${base(id)}/restart`, { method: 'POST' }),
    logout: (id) => request(`${base(id)}/logout`, { method: 'POST' }),
    sendMessage: (id, phone, text) => request(`${base(id)}/send-message`, { method: 'POST', body: { phone, text } }),

    // Settings
    updateSettings: (id, payload) => request(`${base(id)}/settings`, { method: 'PATCH', body: payload }),

    // Logs
    logs: (id, { type = '', search = '', limit } = {}) => {
        const qs = new URLSearchParams();
        if (type) qs.set('type', type);
        if (search) qs.set('search', search);
        if (limit) qs.set('limit', limit);
        const q = qs.toString();
        return request(`${base(id)}/logs${q ? `?${q}` : ''}`);
    },
    clearLogs: (id) => request(`${base(id)}/logs`, { method: 'DELETE' }),
    bulkDeleteLogs: (id, ids) => request(`${base(id)}/logs/bulk-delete`, { method: 'POST', body: { ids } }),

    // Conversations
    resetConversation: (id, jid) => request(`${base(id)}/conversations/${encodeURIComponent(jid)}`, { method: 'DELETE' }),

    // Profile / account
    me: () => request('/auth/me'),
    authConfig: () => request('/auth/config'),
    updateProfile: (payload) => request('/auth/profile', { method: 'PATCH', body: payload }),
    changePassword: (payload) => request('/auth/password', { method: 'POST', body: payload }),
    linkGoogle: (credential) => request('/auth/google/link', { method: 'POST', body: { credential } }),
    unlinkGoogle: () => request('/auth/google/unlink', { method: 'POST' }),
};
