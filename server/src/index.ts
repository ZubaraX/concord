import dns from "node:dns";
// Prefer IPv4 for all outbound connections. This box has flaky IPv6 routing to
// some hosts (KLIPY/Tenor), where Node's fetch would otherwise stall ~70s on an
// IPv6 attempt while curl's Happy-Eyeballs picks IPv4 immediately.
dns.setDefaultResultOrder("ipv4first");

import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { config, isProd } from "./config.js";
import { prisma } from "./lib/db.js";
import { authRoutes } from "./routes/auth.js";
import { guildRoutes } from "./routes/guilds.js";
import { channelRoutes } from "./routes/channels.js";
import { messageRoutes } from "./routes/messages.js";
import { inviteRoutes } from "./routes/invites.js";
import { uploadRoutes } from "./routes/uploads.js";
import { friendRoutes } from "./routes/friends.js";
import { dmRoutes } from "./routes/dms.js";
import { userRoutes } from "./routes/users.js";
import { gifRoutes } from "./routes/gifs.js";
import { registerPushRoutes } from "./lib/push.js";
import { attachGateway } from "./realtime/gateway.js";

async function main() {
  const app = Fastify({
    logger: isProd ? true : { transport: { target: "pino-pretty" } },
    bodyLimit: config.MAX_UPLOAD_BYTES > 0 ? config.MAX_UPLOAD_BYTES : 1024 * 1024 * 1024, // 1 GB default JSON cap
  });

  // Open CORS: self-hosted, all-access. The desktop app and Codespaces
  // origins are all allowed; auth is by bearer token, not cookies.
  await app.register(cors, { origin: true, credentials: true });

  await app.register(jwt, {
    secret: config.JWT_ACCESS_SECRET,
  });

  // Reasonable, non-aggressive rate limit (spec: ~10 req/s, not punishing).
  await app.register(rateLimit, {
    max: 600,
    timeWindow: "1 minute",
    allowList: (req) => req.url === "/health",
  });

  // File uploads: no size cap unless MAX_UPLOAD_BYTES is set (the "no limits" rule).
  await app.register(multipart, {
    limits: { fileSize: config.MAX_UPLOAD_BYTES > 0 ? config.MAX_UPLOAD_BYTES : Number.MAX_SAFE_INTEGER },
  });

  // Serve uploaded files back at /uploads/*.
  const uploadDir = resolve(config.STORAGE_DIR);
  mkdirSync(uploadDir, { recursive: true });
  await app.register(fastifyStatic, { root: uploadDir, prefix: "/uploads/" });

  app.get("/health", async () => ({ status: "ok", ts: Date.now() }));

  // WebRTC ICE servers for the voice/screen-share clients (env-configurable).
  app.get("/api/ice", async () => {
    const stun = config.STUN_URLS.split(",").map((s) => s.trim()).filter(Boolean);
    const iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }> = [
      { urls: stun },
    ];
    if (config.TURN_URLS) {
      iceServers.push({
        urls: config.TURN_URLS.split(",").map((s) => s.trim()).filter(Boolean),
        username: config.TURN_USERNAME,
        credential: config.TURN_PASSWORD,
      });
    } else {
      // Free public TURN fallback so cross-NAT voice works without setup.
      for (const u of [
        "turn:openrelay.metered.ca:80",
        "turn:openrelay.metered.ca:443",
        "turn:openrelay.metered.ca:443?transport=tcp",
      ]) {
        iceServers.push({ urls: u, username: "openrelayproject", credential: "openrelayproject" });
      }
    }
    return { iceServers };
  });

  // Friendly landing page so opening the server URL in a browser isn't a 404.
  app.get("/", async (_req, reply) => {
    reply.type("text/html").send(
      `<!doctype html><meta charset="utf-8"><title>Concord</title>
       <body style="font-family:system-ui;background:#313338;color:#dbdee1;display:grid;place-items:center;height:100vh;margin:0;text-align:center">
       <div><h1 style="color:#5865f2">Concord</h1>
       <p>The API + gateway is running. ✅</p>
       <p style="color:#949ba4">Open the <b>Concord desktop app</b> and set this URL as your <b>Server URL</b>.</p></div></body>`
    );
  });

  // Invite links open here; the desktop app joins by the code.
  app.get("/invite/:code", async (req, reply) => {
    const { code } = req.params as { code: string };
    reply.type("text/html").send(
      `<!doctype html><meta charset="utf-8"><title>Concord invite</title>
       <body style="font-family:system-ui;background:#313338;color:#dbdee1;display:grid;place-items:center;height:100vh;margin:0;text-align:center">
       <div><h1 style="color:#5865f2">You've been invited to Concord</h1>
       <p>Open the <b>Concord app</b>, click <b>+ → Join</b>, and paste this code:</p>
       <p style="font-size:1.5rem;font-weight:700;letter-spacing:2px">${code.replace(/[^\w-]/g, "")}</p></div></body>`
    );
  });

  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(guildRoutes, { prefix: "/api/guilds" });
  await app.register(channelRoutes, { prefix: "/api/channels" });
  await app.register(messageRoutes, { prefix: "/api" });
  await app.register(inviteRoutes, { prefix: "/api" });
  await app.register(uploadRoutes, { prefix: "/api" });
  await app.register(friendRoutes, { prefix: "/api/friends" });
  await app.register(dmRoutes, { prefix: "/api/dms" });
  await app.register(userRoutes, { prefix: "/api/users" });
  await app.register(gifRoutes, { prefix: "/api/gifs" });
  registerPushRoutes(app);

  // SQLite tuning: WAL gives concurrent reads during writes; busy_timeout
  // avoids transient "database is locked" under load. journal_mode returns a
  // row, so it must use queryRaw (executeRaw forbids result rows on SQLite).
  try {
    await prisma.$queryRawUnsafe("PRAGMA journal_mode=WAL;");
    await prisma.$queryRawUnsafe("PRAGMA busy_timeout=5000;");
    await prisma.$queryRawUnsafe("PRAGMA synchronous=NORMAL;");
  } catch (err) {
    app.log.warn({ err }, "SQLite PRAGMA tuning skipped");
  }

  // Bind HTTP, then attach Socket.io to the same underlying server.
  await app.listen({ port: config.SERVER_PORT, host: "0.0.0.0" });
  attachGateway(app);

  app.log.info(`Concord API + gateway on :${config.SERVER_PORT}`);
}

main().catch((err) => {
  console.error("Fatal boot error:", err);
  process.exit(1);
});
