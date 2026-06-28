// Penyimpan state terakhir di sisi client (status & qr).
// QR render butuh tahu status terakhir, dan sebaliknya, jadi keduanya
// dipusatkan di sini agar tidak ada variabel global yang tersebar.

let latestStatus = {};
let latestQr = null;

export const store = {
    getStatus: () => latestStatus,
    setStatus(status = {}) {
        latestStatus = status;
        return latestStatus;
    },
    getQr: () => latestQr,
    setQr(qr = null) {
        latestQr = qr;
        return latestQr;
    },
};
