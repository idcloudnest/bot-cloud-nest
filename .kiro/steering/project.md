---
inclusion: always
---

# Cloud Nest Bot

WhatsApp bot (Baileys) with a web dashboard for monitoring connection, QR login, logs, sessions, and settings. Node.js ESM, no build step.

## Stack
- Node 20, ESM (`"type": "module"`), no TypeScript, no bundler.
- `@whiskeysockets/baileys` for WhatsApp, `express` + `socket.io` for the dashboard.
- `pino` logger (silent), `qrcode` for QR data URLs.
- State persisted as JSON files in `storage/` (no database).

## Commands
- `npm run dev` — watch mode (do not run as a blocking command; let the user run it).
- `npm start` — production run.
- Docker: `docker-compose.yml` runs `cloud-nest-bot-staging` on port 3000, mounts `auth_info_baileys` and `storage`.

## Architecture
- `src/index.js` — entry. Starts web server, then starts bot only if `auth_info_baileys/creds.json` has a real session; otherwise idle.
- `src/bot.js` — Baileys socket lifecycle: QR generation (60s timeout + kill switch), connect/close handling, auto-reconnect, logout/restart. Exports `getSocket`, `startBot`, `sendWhatsAppMessage`, `logoutWhatsApp`, `restartWhatsApp`.
- `src/web/server.js` — Express REST API + Socket.IO realtime events. Serves `public/`.
- `src/web/auth.js` — HTTP Basic Auth gate (admin user/pass from config).
- `src/state/app-state.js` — single source of truth via `EventEmitter`. Holds status, qr, logs, settings. Persists logs+settings to `storage/app-state.json`.
- `src/services/session.service.js` — per-JID conversation sessions, persisted to `storage/sessions.json`.
- `src/handlers/message.handler.js` — incoming message flow (active handler).
- `src/handlers/command.handler.js` — demo store flow (categories/products). Not wired into messages.upsert currently.
- `src/utils/` — `formatter.js` (rupiah, JID normalize), `fs.js` (Docker-safe dir clean), `storage.js` (atomic JSON read/write).

## Conventions
- Keep ESM `import`/`export`; use `node:` prefix for builtins.
- All shared/runtime state goes through `app-state.js` setters so Socket.IO stays in sync — don't mutate state directly elsewhere.
- Persist via `storage.js` `readJson`/`writeJson` only. JSON files live in `storage/`.
- Comments and user-facing bot text are in Indonesian; match that style.
- Phone numbers normalized to Indonesian `62...@s.whatsapp.net` via `normalizePhoneToJid`.
- Never commit `auth_info_baileys/`, `.env`, or `storage/*.json` contents (secrets/session data).

## Realtime contract
- REST under `/api/*`; Socket.IO events: `state`, `status`, `qr`, `settings`, `log`, `logs:init`, `logs:clear`, `logs:deleted_multiple`, `sessions`. Frontend in `public/` consumes these.
