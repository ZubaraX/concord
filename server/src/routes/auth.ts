import { randomBytes } from "node:crypto";
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
import { sendMail } from "../lib/mail.js";
import { emitToGuild } from "../services/guilds.js";

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

type AnyUser = {
  id: string;
  username: string;
  discriminator: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  bannerUrl?: string | null;
  accentColor?: string | null;
  bio?: string | null;
  customStatus?: string | null;
  pronouns?: string | null;
  status?: string;
};

function publicUser(u: AnyUser) {
  return {
    id: u.id,
    username: u.username,
    discriminator: u.discriminator,
    email: u.email,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    bannerUrl: u.bannerUrl ?? null,
    accentColor: u.accentColor ?? null,
    bio: u.bio ?? null,
    customStatus: u.customStatus ?? null,
    pronouns: u.pronouns ?? null,
    status: u.status ?? "OFFLINE",
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

  // Update the current user's profile (settings). All fields optional.
  app.patch("/me", { preHandler: authenticate }, async (req, reply) => {
    const body = z
      .object({
        displayName: z.string().min(1).max(64).optional(),
        avatarUrl: z.string().url().nullable().optional(),
        bannerUrl: z.string().url().nullable().optional(),
        accentColor: z.string().max(16).nullable().optional(),
        bio: z.string().max(4000).nullable().optional(),
        customStatus: z.string().max(128).nullable().optional(),
        pronouns: z.string().max(40).nullable().optional(),
        status: z.enum(["ONLINE", "IDLE", "DND", "OFFLINE"]).optional(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const user = await prisma.user.update({ where: { id: req.userId }, data: body.data });

    // Push the change to every guild the user is in so member lists update live.
    const memberships = await prisma.guildMember.findMany({
      where: { userId: req.userId },
      select: { guildId: true },
    });
    for (const m of memberships) emitToGuild(m.guildId, "user:update", { guildId: m.guildId });
    // A manual status change (e.g. DND) must also hit the live presence maps,
    // otherwise the connect-time ONLINE keeps overriding it in member lists.
    if (body.data.status) {
      for (const m of memberships) {
        emitToGuild(m.guildId, "presence:update", { userId: req.userId, status: body.data.status });
      }
    }

    return reply.send({ user: publicUser(user) });
  });

  // ── Password reset by email ────────────────────────────────────────────────
  // Request a code. Always returns ok (don't reveal whether the email exists).
  app.post("/forgot", async (req, reply) => {
    const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid email" });

    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (user) {
      const code = randomBytes(4).toString("hex").toUpperCase(); // 8-char code
      await prisma.user.update({
        where: { id: user.id },
        data: { resetCode: code, resetExpires: new Date(Date.now() + 30 * 60 * 1000) },
      });
      await sendMail(
        user.email,
        "Concord — password reset code",
        `Your Concord password reset code is: ${code}\n\nEnter it in the app to set a new password. The code expires in 30 minutes.\nIf you didn't request this, you can ignore this email.`
      );
    }
    return reply.send({ ok: true });
  });

  // Apply a new password using the emailed code.
  app.post("/reset", async (req, reply) => {
    const parsed = z
      .object({
        email: z.string().email(),
        code: z.string().min(4).max(64),
        password: z.string().min(6).max(256),
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid input" });

    const { email, code, password } = parsed.data;
    const user = await prisma.user.findUnique({ where: { email } });
    if (
      !user ||
      !user.resetCode ||
      user.resetCode !== code.trim().toUpperCase() ||
      !user.resetExpires ||
      user.resetExpires < new Date()
    ) {
      return reply.code(400).send({ error: "Invalid or expired code" });
    }

    const passwordHash = await hashPassword(password);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, resetCode: null, resetExpires: null },
    });
    // Revoke existing refresh tokens so old sessions can't continue.
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    return reply.send({ ok: true });
  });
}
