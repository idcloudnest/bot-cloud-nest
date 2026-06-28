// Instance Socket.IO tunggal yang dipakai bersama oleh semua fitur.
// socket.io.js di-load global via <script>, jadi `io` tersedia di window.
export const socket = window.io();
