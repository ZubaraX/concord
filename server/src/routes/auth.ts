import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import {
  hashPassword,
  verifyPassword,
  issueTokens,
  authenticate,
} from "../lib/auth.js";
import { config } from "../config.js";

const credentials = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(256),
});

const registerBody = credentials.extend({
  username: z.string().min(2).max(32),
});

// Random 4-digit discriminator so usernames need not be globally unique.
const randomDiscriminator = () =>
  String(Math.floor(Math.random() * 10000)).padStart(4, "0");

function publicUser(u: {
  id: string;
  username: string;
  discriminator: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}) {
  return {
    id: u.id,
    username: u.username,
    discriminator: u.discriminator,
    email: u.email,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
  };
}

export async function authRoutes(app: FastifyInstance) {
  app.post("/register", async (req, reply) => {
    const parsed = registerBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const { email, password, username } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return reply.code(409).send({ error: "Email already in use" });

    // Find an unused username#discriminator pair.
    let discriminator = randomDiscriminator();
    for (let i = 0; i < 5; i++) {
      const taken = await prisma.user.findUnique({
        where: { username_discriminator: { username, discriminator } },
      });
      if (!taken) break;
      discriminator = randomDiscriminator();
    }

    const user = await prisma.user.create({
      data: {
        email,
        username,
        discriminator,
        passwordHash: await hashPassword(password),
        displayName: username,
        status: "ONLINE",
      },
    });

    const tokens = await issueTokens(reply, user);
    return reply.code(201).send({ user: publicUser(user), ...tokens });
  });

  app.post("/login", async (req, reply) => {
    const parsed = credentials.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await verifyPassword(user.passwordHash, password))) {
      return reply.code(401).send({ error: "Invalid credentials" });
    }

    const tokens = await issueTokens(reply, user);
    return reply.send({ user: publicUser(user), ...tokens });
  });

  // Exchange a (non-revoked, unexpired) refresh token for a fresh access token.
  app.post("/refresh", async (req, reply) => {
    const { refreshToken } = (req.body ?? {}) as { refreshToken?: string };
    if (!refreshToken) return reply.code(400).send({ error: "Missing token" });

    const stored = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });
    if (!stored || stored.revoked || stored.expiresAt < new Date()) {
      return reply.code(401).send({ error: "Invalid refresh token" });
    }

    const accessToken = await reply.jwtSign(
      { username: stored.user.username },
      { sign: { sub: stored.user.id, expiresIn: config.ACCESS_TOKEN_TTL } }
    );
    return reply.send({ accessToken });
  });

  app.post("/logout", async (req, reply) => {
    const { refreshToken } = (req.body ?? {}) as { refreshToken?: string };
    if (refreshToken) {
      await prisma.refreshToken.updateMany({
        where: { token: refreshToken },
        data: { revoked: true },
      });
    }
    return reply.send({ ok: true });
  });

  // Current user.
  app.get("/me", { preHandler: authenticate }, async (req, reply) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return reply.code(404).send({ error: "Not found" });
    return reply.send({ user: publicUser(user) });
  });
}
