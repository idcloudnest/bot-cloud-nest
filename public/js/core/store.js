// Client-side state: the currently selected account + its status/qr.
// The detail panel only shows the active account; the sidebar account list uses
// the 'sessions' event payload directly.

let currentSessionId = null;
let status = {};
let qr = null;
let view = 'detail'; // 'detail' = selected account panel, 'list' = account list table
let user = null; // current logged-in user (id, name, email, role)

export const store = {
    getUser: () => user,
    setUser(value = null) {
        user = value;
        return user;
    },
    isSuperadmin: () => user?.role === 'superadmin',

    getCurrent: () => currentSessionId,
    setCurrent(id) {
        currentSessionId = id;
        status = {};
        qr = null;
        return id;
    },
    isCurrent: (id) => id != null && id === currentSessionId,

    getView: () => view,
    setView(value) {
        view = value;
        return view;
    },

    getStatus: () => status,
    setStatus(value = {}) {
        status = value;
        return status;
    },

    getQr: () => qr,
    setQr(value = null) {
        qr = value;
        return qr;
    },
};
