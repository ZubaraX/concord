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

  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(guildRoutes, { prefix: "/api/guilds" });
  await app.register(channelRoutes, { prefix: "/api/channels" });
  await app.register(messageRoutes, { prefix: "/api" });
  await app.register(inviteRoutes, { prefix: "/api" });
  await app.register(uploadRoutes, { prefix: "/api" });

  // SQLite tuning: WAL gives concurrent reads during writes; busy_timeout
  // avoids transient "database is locked" under load.
  try {
    await prisma.$executeRawUnsafe("PRAGMA journal_mode=WAL;");
    await prisma.$executeRawUnsafe("PRAGMA busy_timeout=5000;");
    await prisma.$executeRawUnsafe("PRAGMA synchronous=NORMAL;");
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
