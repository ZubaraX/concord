# Concord

A self-hosted, open-source Discord alternative — text, voice, video and screen
share in real time, with **no artificial limits**. Every feature is free for
everyone: no Nitro, no boosts, no subscription tiers, no gated functions.

Russian-friendly: the whole interface ships in **English and Русский** with a
live language switcher.

## Features

- **Servers & channels** — categories, text + voice channels, invites, member list, roles scaffolding.
- **Real-time text** — typing indicators, presence, reactions, replies, pins, edits, unread indicators & "new messages" divider, link previews.
- **Voice & video** — WebRTC P2P mesh with a self-hosted **coturn** TURN server, Opus audio, perfect-negotiation + ICE-candidate queuing.
- **Screen share & camera** — pick a screen or app window, share system audio, up to 4K / high-FPS, no caps.
- **In-call extras** — per-user **local volume** (separate sliders for voice and screen audio), floating emoji reactions, and an **always-on-top "who's speaking" overlay** (click-through, toggle + corner, collapse hotkey).
- **DMs & friends** — direct messages, friend requests, calls.
- **GIF picker** — categories + infinite scroll (KLIPY), proxied through the server so the API key stays private.
- **Images in-app** — uploads open in a built-in lightbox (zoom / download), no browser bounce.
- **Profiles** — display name, avatar, **banner**, accent color, **pronouns**, custom status, bio.
- **Themes** — 6 color themes (Blurple, Midnight, Aurora, Sunset, Crimson, Light) with gradients & depth.
- **App sounds** — synthesized join/leave/mute/message/ring cues (volume configurable).
- **Account** — JWT access + refresh, **password reset by email**.
- **Desktop niceties** — taskbar unread badge, global hotkeys, **auto-update** from GitHub Releases with a download screen + "What's New".

## How it's deployed

- **Server** runs on any Node host (a small VPS works great) behind nginx, with **coturn** for WebRTC TURN.
- **Database** is a single **SQLite** file — no Postgres, Redis, or Docker required.
- **Desktop client** is an **Electron** app shipped as a one-click installer with the server URL baked in; it **auto-updates** from GitHub Releases.

```
 ┌──────────────────────┐      HTTPS / WebSocket / WebRTC      ┌────────────────────────┐
 │  Concord Desktop App  │ ───────────────────────────────────▶│  Server (your VPS)       │
 │  (Electron, your PC)  │   media P2P via coturn (TURN)        │  Fastify + Socket.io     │
 └──────────────────────┘                                      │  SQLite · coturn · nginx │
                                                               └────────────────────────┘
```

## Stack

| Layer       | Tech                                                          |
|-------------|---------------------------------------------------------------|
| Frontend    | React 18, TypeScript, Vite, Tailwind, Zustand, TanStack Query |
| Desktop     | Electron + electron-updater (auto-update), electron-builder   |
| Backend     | Node.js, Fastify 5, Socket.io                                 |
| Database    | **SQLite** via Prisma (single file)                           |
| Voice/Video | WebRTC (P2P mesh) + self-hosted **coturn** (STUN/TURN)        |
| Email       | nodemailer (SMTP) for password reset                          |
| Storage     | local filesystem (S3/MinIO optional)                          |

## Run the server

```bash
cp .env.example .env          # set JWT secrets, TURN_*, SMTP_*, etc.
npm install
npm run db:generate && npm run db:migrate && npm run db:seed
npm run dev:server            # API + gateway on :4000
```

Demo login (seeded): `demo@concord.dev` / `password123`.

For production: run the server under a process manager (e.g. systemd), put nginx
in front (proxy `:80/:443` → `:4000` with WebSocket upgrade), and run **coturn**
so cross-network voice works. Point `TURN_URLS` / `TURN_USERNAME` /
`TURN_PASSWORD` at it; the client fetches ICE config from `/api/ice`.

### Optional services

- **GIF search** — set `KLIPY_KEY` (free lifetime key from partner.klipy.com). `TENOR_KEY` (Tenor v2) works as a fallback. Without a key the picker just returns nothing.
- **Password-reset email** — set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`. Without SMTP the reset code is logged server-side instead of emailed.

## Build the desktop app

```bash
# bake your server URL into the build, then package
VITE_API_URL="https://your-server.example.com" npm run build       --workspace client
npm run build:electron --workspace client
npm run desktop:build  --workspace client     # → client/release/ (NSIS installer)
```

To enable **auto-update**, publish the installer + `latest.yml` to GitHub
Releases (the `publish` block in `client/electron-builder.yml` points at the
repo); `electron-builder --publish always` with a `GH_TOKEN` does this.

Browser during development? `npm run dev` runs the web client on `:5173`
proxied to the local server. Desktop hot-reload: `npm run desktop:dev --workspace client`.

## The "no limits" principle

| Feature             | Discord          | Concord                          |
|---------------------|------------------|----------------------------------|
| Upload size         | 8–500 MB         | Unlimited (`MAX_UPLOAD_BYTES=0`) |
| Message length      | 2000–4000        | 100,000 (DoS guard only)         |
| Servers / members   | capped           | hardware-bound                   |
| Screen share        | 1080p/60 (Nitro) | up to 4K, high FPS               |
| Custom emoji, roles | capped           | unlimited                        |
| Themes / customization | Nitro          | everyone                         |

All features are available to all users — there is no paid tier anywhere in the
code. Limits live in `.env` only, so a public host can set sane bounds.

## Project layout

```
concord/
├── .env.example
├── server/                  # Fastify API + Socket.io gateway
│   ├── prisma/schema.prisma  # SQLite
│   └── src/{routes,realtime,services,lib}
└── client/                  # React + Vite SPA → Electron desktop app
    ├── electron/            # main.cjs (updater, overlay, screen picker…), preload.cjs
    ├── electron-builder.yml
    └── src/{store,api,lib,components,pages}
```

## License

Open source. Self-host it; your data stays in your own SQLite file.
