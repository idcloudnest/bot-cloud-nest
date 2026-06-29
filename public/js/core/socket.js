// Single shared Socket.IO instance used by all features.
// socket.io.js is loaded globally via <script>, so `io` is available on window.
export const socket = window.io();

// If the socket can't authenticate (expired/cleared cookie), go back to login.
socket.on('connect_error', (err) => {
    if (err && err.message === 'unauthorized') {
        window.location.href = '/login';
    }
});
