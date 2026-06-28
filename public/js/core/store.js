// State sisi client: akun yang sedang dipilih + status/qr akun tersebut.
// Detail panel hanya menampilkan akun aktif; daftar akun di sidebar pakai
// payload event 'sessions' langsung.

let currentSessionId = null;
let status = {};
let qr = null;
let view = 'detail'; // 'detail' = panel akun terpilih, 'list' = tabel daftar akun

export const store = {
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
