# Concord

A self-hosted, open-source Discord alternative — text, voice, video and screen
share in real time, with **no artificial limits**. Every feature is free for
everyone: no Nitro, no boosts, no subscription tiers, no gated functions.
Ships as a **Windows desktop app** and a **native Android app** from a single
codebase.

Russian-friendly: the whole interface ships in **English and Русский** with a
live language switcher.

## Features

- **Servers & channels** — categories, text + voice channels, drag-and-drop reordering, invites (one-click join cards), member list.
- **Roles & permissions** — create roles with colors and permission toggles (Administrator, Manage Channels/Roles/Emojis), assign to members; the guild owner bypasses all checks.
- **Custom server emoji** — upload your own, use as `:name:` in messages and the emoji picker.
- **Real-time text** — typing indicators, presence (Online/Idle/DND/Invisible, remembered across launches), reactions, replies (swipe-to-reply on mobile), pins, edits, bookmarks, unread indicators & "new messages" divider, link previews, **message search**, **polls**, **scheduled messages**, **voice messages**.
- **Voice & video** — WebRTC P2P mesh with a self-hosted **coturn** TURN server, Opus audio, perfect-negotiation + ICE-candidate queuing, a Discord-style voice stage, call timer, deafen, push-to-talk indicator, and a connection-quality (ping/loss) meter.
- **Screen share & camera** — desktop: pick a screen or app window, share system audio, up to 4K / high-FPS. **Android: native screen share** via MediaProjection, front/back camera flip, speakerphone toggle.
- **In-call extras** — per-user **local volume** (separate sliders for voice and screen audio), floating emoji reactions, and an **always-on-top "who's speaking" overlay** (desktop; click-through, collapse hotkey).
- **DMs & friends** — direct messages, friend requests, calls.
- **Notifications** — per-channel/server mute + Do-Not-Disturb; **self-hosted Android push** (foreground service over SSE, no Google FCM) for DMs, mentions and incoming calls, with launcher badge + vibration.
- **Images & files** — unlimited uploads, in-app lightbox, client-side photo compression, **HEIC→JPEG** conversion, share-to-Concord from other apps (Android).
- **Profiles** — display name, **uploadable avatar & banner with drag-to-reposition**, accent color, pronouns, custom status, bio.
- **Themes** — 6 color themes (Blurple, Midnight, Aurora, Sunset, Crimson, Light) with a smooth crossfade on switch.
- **Account & security** — JWT access + refresh, password reset by email, **change password**, **active-sessions list** with per-device sign-out.
- **Auto-update** — both the desktop app (GitHub Releases + electron-updater) and the Android APK (in-app update banner) update themselves.

## How it's deployed

- **Server** runs on any Node host (a small VPS works great) behind nginx (HTTPS via Let's Encrypt), with **coturn** for WebRTC TURN.
- **Database** is a single **SQLite** file — no Postgres, Redis, or Docker required.
- **Desktop client** is an **Electron** app shipped as a one-click installer with the server URL baked in; it **auto-updates** from GitHub Releases.
- **Android client** is a **Capacitor** wrapper around the same web build, published as an APK; it self-updates via an in-app banner and adds native push, screen capture, and share-target support.
- **CI** builds all three targets (Android APK, Windows desktop, server deploy) from one push — see `.github/workflows/`.

```
 ┌──────────────────────┐                                      ┌────────────────────────┐
 │  Desktop (Electron)   │      HTTPS / WebSocket / WebRTC      │  Server (your VPS)       │
 │  Android (Capacitor)  │ ───────────────────────────────────▶│  Fastify + Socket.io     │
 │  Web browser          │   media P2P via coturn (TURN)        │  SQLite · coturn · nginx │
 └──────────────────────┘                                      └────────────────────────┘
```

## Stack

| Layer       | Tech                                                          |
|-------------|---------------------------------------------------------------|
| Frontend    | React 18, TypeScript, Vite, Tailwind, Zustand, TanStack Query |
| Desktop     | Electron + electron-updater (auto-update), electron-builder   |
| Mobile      | Capacitor (Android), native plugins for push / screen capture |
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

Register an account from the app's sign-up screen on first run.

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
├── .github/workflows/      # android.yml · desktop.yml · deploy.yml (CI)
├── server/                  # Fastify API + Socket.io gateway
│   ├── prisma/schema.prisma  # SQLite
│   └── src/{routes,realtime,services,lib}
└── client/                  # React + Vite SPA → Electron desktop + Capacitor Android
    ├── electron/            # main.cjs (updater, overlay, screen picker…), preload.cjs
    ├── android-extras/      # native Java: push service, screen capture, share target
    ├── electron-builder.yml
    ├── capacitor.config.ts
    └── src/{store,api,lib,components,pages}
```

## License

Open source. Self-host it; your data stays in your own SQLite file.
