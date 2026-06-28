---
inclusion: always
---

# Cloud Nest Bot

Multi-account WhatsApp bot (Baileys) dengan web dashboard. Tiap akun WhatsApp ("session") punya koneksi, QR, status, log, settings, dan percakapan sendiri. Semua data disimpan di MySQL. Node.js ESM, tanpa build step.

## Stack
- Node 20, ESM (`"type": "module"`), tanpa TypeScript/bundler.
- `@whiskeysockets/baileys` (WhatsApp), `express` + `socket.io` (dashboard), `mysql2/promise` (DB).
- `pino` logger, `qrcode` (QR data URL).
- Persistence: MySQL (tidak ada lagi file JSON / auth_info_baileys).

## Commands
- `npm run dev` — watch mode (jangan dijalankan sebagai blocking command).
- `npm start` — produksi.
- Docker: `docker-compose.yml`, port 3000, `host.docker.internal` untuk akses MySQL host.

## Database (config via env DB_*)
- `sessions` — registry akun: id (slug), name, kolom status (connection, connected, message, last_error, device JSON), settings per akun (ignore_groups, ignore_privates, log_limit).
- `auth_state` — auth Baileys (creds + signal keys) per akun: (session_id, data_key, data_value LONGTEXT).
- `conversations` — state flow percakapan per (session_id, jid): step, data JSON.
- `logs` — log per akun: type, jid, payload JSON, created_at.
- FK semua child → `sessions(id)` ON DELETE CASCADE.

## Arsitektur
- `src/index.js` — entry: `migrate()` → `startWebServer()` → `resumeSessions()`.
- `src/config.js` — config termasuk `config.db`.
- `src/db/` — `pool.js` (pool lazy + `query()`), `migrate.js` (CREATE TABLE idempotent), `repositories/*.repo.js` (session, auth, conversation, log).
- `src/whatsapp/auth-state.js` — `useMySQLAuthState(sessionId)` (pengganti useMultiFileAuthState) pakai `initAuthCreds` + `BufferJSON` + `proto` (named imports dari baileys).
- `src/whatsapp/session-manager.js` — `connections` Map per sessionId; `createSession/startSession/restartSession/logoutSession/sendMessage/deleteSession/resumeSessions/getSocket/listSessions`. ID akun valid: `/^[a-z0-9][a-z0-9_-]{1,63}$/`.
- `src/state/events.js` — `bus` (EventEmitter) + `EVENTS`. `app-state.js` — helper per-session (runtime Map simpan qr + logLimit) yang update DB lalu emit ke bus.
- `src/handlers/message.handler.js` — `handleMessage(sessionId, sock, msg)`.
- `src/web/server.js` — REST `/api/sessions` + `/api/sessions/:id/*` (start/restart/logout/send-message/settings/logs/logs/bulk-delete/conversations); meneruskan semua event bus ke Socket.IO.
- `public/js/` — modular ES modules: `core/` (dom, api, socket, store), `ui/` (toast, modal), `features/` (accounts, status, qr, device, logs, conversations, settings, send-message), `main.js` entry.

## Konvensi
- ESM `import`/`export`; `node:` prefix untuk builtins.
- Semua state melalui setter di `app-state.js` (yang update DB + emit bus). Jangan tulis DB langsung dari luar repository.
- Akses DB hanya lewat `db/repositories/*`. JSON column ditulis dengan `JSON.stringify`, dibaca sudah otomatis ter-parse oleh mysql2.
- Komentar & teks bot dalam Bahasa Indonesia.
- Nomor dinormalisasi ke `62...@s.whatsapp.net` via `normalizePhoneToJid`.
- Jangan commit `.env` (berisi kredensial DB).

## Realtime contract (Socket.IO)
Event (semua payload bawa `sessionId`, kecuali `sessions` = array akun):
`sessions`, `session:status`, `session:qr`, `session:settings`, `session:log`, `session:logs:init`, `session:logs:clear`, `session:logs:deleted`, `session:conversations`.
Frontend: pilih akun → `GET /api/sessions/:id` (snapshot) → update live difilter per `sessionId`.
