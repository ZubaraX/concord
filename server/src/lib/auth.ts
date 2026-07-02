// Auth helpers: password hashing (argon2), token issuing, and a Fastify
// preHandler that authenticates the access token.
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "./db.js";
import { config } from "../config.js";

// bcryptjs is pure-JS (no native build). For production you can swap in argon2.
export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);
export const verifyPassword = (hash: string, pw: string) => bcrypt.compare(pw, hash);

export interface AccessPayload {
  sub: string; // user id
  username: string;
}

export async function issueTokens(
  reply: FastifyReply,
  user: { id: string; username: string },
  device?: string
) {
  const accessToken = await reply.jwtSign(
    { username: user.username },
    { sign: { sub: user.id, expiresIn: config.ACCESS_TOKEN_TTL } }
  );

  // Opaque refresh token persisted server-side so it can be revoked.
  const token = randomBytes(48).toString("hex");
  await prisma.refreshToken.create({
    data: {
      token,
      userId: user.id,
      expiresAt: new Date(Date.now() + config.REFRESH_TOKEN_TTL * 1000),
      device: device ?? null,
    },
  });

  return { accessToken, refreshToken: token };
}

/** Short human label for the sessions list, derived from the User-Agent. */
export function deviceLabel(req: FastifyRequest): string {
  const ua = String(req.headers["user-agent"] ?? "");
  const os = /Android/i.test(ua)
    ? "Android"
    : /Windows/i.test(ua)
    ? "Windows"
    : /Mac OS|Macintosh/i.test(ua)
    ? "macOS"
    : /Linux/i.test(ua)
    ? "Linux"
    : "—";
  const app = /Electron/i.test(ua) ? "приложение ПК" : /Android/i.test(ua) ? "приложение" : "браузер";
  return `${os} · ${app}`;
}

// preHandler guard — verifies JWT and attaches request.userId.
export async function authenticate(req: FastifyRequest, reply: FastifyReply) {
  try {
    const payload = await req.jwtVerify<{ sub: string; username: string }>();
    req.userId = payload.sub;
    req.username = payload.username;
  } catch {
    return reply.code(401).send({ error: "Unauthorized" });
  }
}

declare module "fastify" {
  interface FastifyRequest {
    userId: string;
    username: string;
  }
}
