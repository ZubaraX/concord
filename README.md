# Concord

A self-hosted, open-source Discord clone — text, voice, and video in real time, with **no artificial limits**. Every feature is free for everyone: no Nitro, no boosts, no subscription tiers, no gated functions.

> **Status: foundation / MVP.** Working today: auth, servers (guilds), channels, and real-time text messaging. Voice/video/screen-share (WebRTC SFU) and full-text search are scaffolded with clear integration points — see [Roadmap](#roadmap).

## How it's deployed

- **Server** runs in **GitHub Codespaces** (or any Node host / your own box).
- **Database** is a **local SQLite file** — no Postgres, Redis, or Docker required.
- **Client** is a **desktop app** (Electron) you build once; it connects to your server URL.

```
 ┌─────────────────────┐         HTTPS / WebSocket          ┌──────────────────┐
 │  Concord Desktop App │  ───────────────────────────────▶ │  Server (Codespace) │
 │  (Electron, your PC) │   point it at the forwarded URL    │  Fastify + SQLite   │
 └─────────────────────┘                                    └──────────────────┘
```

## Stack

| Layer        | Tech                                                        |
|--------------|-------------------------------------------------------------|
| Frontend     | React 18, TypeScript, Vite, Tailwind, Zustand, TanStack Query |
| Desktop      | Electron (hardware accel, global hotkeys, screen-capture hook) |
| Backend      | Node.js, Fastify, Socket.io                                 |
| Database     | **SQLite** via Prisma (single file)                         |
| Presence     | in-memory (single instance)                                 |
| Storage      | local filesystem (S3/MinIO optional for production)         |
| Voice/Video  | mediasoup (SFU) + WebRTC (planned)                          |

## Run the server (Codespaces)

1. Open this repo in a Codespace. The devcontainer auto-runs install + migrate + seed.
2. Start it: `npm run dev:server`
3. In the **Ports** tab, set port **4000** visibility to **Public** and copy its forwarded URL
   (looks like `https://<name>-4000.app.github.dev`).

Locally instead? Same thing without Docker:

```bash
cp .env.example .env
npm install
npm run db:generate && npm run db:migrate && npm run db:seed
npm run dev:server     # API + gateway on :4000
```

Demo login (seeded): `demo@concord.dev` / `password123`.

## Build the desktop app

```bash
# from repo root
npm install
npm run desktop:pack  --workspace client   # fast unpacked build → client/release/
# or full installers (nsis/dmg/AppImage):
npm run desktop:build --workspace client
```

Launch the app, enter your **Server URL** on the login screen (the Codespaces
forwarded URL, or `http://localhost:4000` if running locally), then log in.

Prefer the browser during development? `npm run dev` runs the web client on
`http://localhost:5173` proxied to the local server.

Desktop dev (hot reload): `npm run desktop:dev --workspace client`.

## The "no limits" principle

| Feature              | Discord            | Concord                          |
|----------------------|--------------------|----------------------------------|
| Upload size          | 8–500 MB           | Unlimited (`MAX_UPLOAD_BYTES=0`) |
| Message length       | 2000–4000          | 100,000 (DoS guard only)         |
| Servers / members    | capped             | hardware-bound                   |
| Screen share         | 1080p/60 (Nitro)   | up to 4K/8K, 120/144 fps         |
| Custom emoji, roles  | capped             | unlimited                        |
| Animated avatars     | Nitro only         | everyone                         |

All features are available to all users — there is no paid tier or gated
function anywhere in the code. Limits live in `.env` only so a public host can
set sane bounds if it wants to.

## Project layout

```
concord/
├── .devcontainer/          # Codespaces (forwards port 4000)
├── .env.example
├── install.sh
├── server/                 # Fastify API + Socket.io gateway
│   ├── prisma/schema.prisma # SQLite
│   └── src/{routes,realtime,services,lib}
└── client/                 # React + Vite SPA → Electron desktop app
    ├── electron/           # main.cjs, preload.cjs
    ├── electron-builder.yml
    └── src/{store,api,lib,components,pages}
```

## Roadmap

- [x] Auth (JWT access + refresh), users
- [x] Guilds, channels, real-time text messaging, typing, presence
- [x] SQLite (zero-service local DB), desktop app, Codespaces deploy
- [ ] File uploads (local disk / S3), attachments, embeds
- [ ] Roles & permission overwrites (53+ flags wired; UI pending)
- [ ] Voice channels (mediasoup SFU) + screen share (4K/8K, hardware encode)
- [ ] Full-text search, threads, forums, reactions, pins, DMs (+ E2EE)
- [ ] AutoMod, audit log, bot API + slash commands

## License

Open source. Self-host it; your data stays in your SQLite file.
