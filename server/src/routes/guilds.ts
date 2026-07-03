import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { nanoid } from "nanoid";
import { resolve, join } from "node:path";
import { mkdirSync, statSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import { prisma } from "../lib/db.js";
import { authenticate } from "../lib/auth.js";
import { config } from "../config.js";
import { DEFAULT_EVERYONE_PERMISSIONS, ALL_PERMISSIONS } from "../lib/permissions.js";
import { joinGuild, joinGuildRoom, emitToGuild } from "../services/guilds.js";
import { hasGuildPermission } from "../services/access.js";

const createBody = z.object({
  name: z.string().min(1).max(100),
  iconUrl: z.string().url().optional(),
});

export async function guildRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // List guilds the current user is a member of.
  app.get("/", async (req) => {
    const memberships = await prisma.guildMember.findMany({
      where: { userId: req.userId },
      include: {
        guild: {
          include: {
            channels: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
          },
        },
      },
      orderBy: { joinedAt: "asc" },
    });
    return memberships.map((m) => m.guild);
  });

  // Create a guild — owner gets a full-permission role, plus default channels.
  app.post("/", async (req, reply) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const guild = await prisma.guild.create({
      data: {
        name: parsed.data.name,
        iconUrl: parsed.data.iconUrl,
        ownerId: req.userId,
        roles: {
          create: [
            {
              name: "@everyone",
              isDefault: true,
              position: 0,
              permissions: DEFAULT_EVERYONE_PERMISSIONS.toString(),
            },
            {
              name: "Owner",
              color: "#f1c40f",
              position: 1,
              hoist: true,
              permissions: ALL_PERMISSIONS.toString(),
            },
          ],
        },
        channels: {
          create: [
            { name: "Text Channels", type: "CATEGORY", position: 0 },
            { name: "general", type: "TEXT", position: 1 },
            { name: "Voice Channels", type: "CATEGORY", position: 2 },
            { name: "General", type: "VOICE", position: 3, bitrate: 256000 },
          ],
        },
      },
      include: { roles: true, channels: true },
    });

    const ownerRole = guild.roles.find((r) => r.name === "Owner")!;
    await prisma.guildMember.create({
      data: {
        guildId: guild.id,
        userId: req.userId,
        roles: { connect: { id: ownerRole.id } },
      },
    });

    // Creator's live socket should immediately receive this guild's events.
    joinGuildRoom(guild.id, req.userId);
    return reply.code(201).send(guild);
  });

  // Guild detail with channels, roles, and members.
  app.get("/:guildId", async (req, reply) => {
    const { guildId } = req.params as { guildId: string };

    const member = await prisma.guildMember.findUnique({
      where: { guildId_userId: { guildId, userId: req.userId } },
    });
    if (!member) return reply.code(403).send({ error: "Not a member" });

    const guild = await prisma.guild.findUnique({
      where: { id: guildId },
      include: {
        channels: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
        roles: { orderBy: { position: "desc" } },
        emojis: { orderBy: { name: "asc" } },
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                discriminator: true,
                displayName: true,
                avatarUrl: true,
                status: true,
              },
            },
            roles: true,
          },
        },
      },
    });
    if (!guild) return reply.code(404).send({ error: "Not found" });
    return reply.send(guild);
  });

  // Join an existing guild directly by id (open join).
  app.post("/:guildId/join", async (req, reply) => {
    const { guildId } = req.params as { guildId: string };
    const guild = await prisma.guild.findUnique({ where: { id: guildId } });
    if (!guild) return reply.code(404).send({ error: "Not found" });
    const member = await joinGuild(guildId, req.userId);
    return reply.code(201).send(member);
  });

  // Create an invite code for a guild (members only). No expiry/limit by default.
  app.post("/:guildId/invites", async (req, reply) => {
    const { guildId } = req.params as { guildId: string };
    const isMember = await prisma.guildMember.findUnique({
      where: { guildId_userId: { guildId, userId: req.userId } },
    });
    if (!isMember) return reply.code(403).send({ error: "Not a member" });

    const body = z
      .object({ maxUses: z.number().int().min(0).optional(), expiresInSec: z.number().int().min(0).optional() })
      .parse(req.body ?? {});

    const invite = await prisma.invite.create({
      data: {
        code: nanoid(8),
        guildId,
        inviterId: req.userId,
        maxUses: body.maxUses ?? 0,
        expiresAt: body.expiresInSec ? new Date(Date.now() + body.expiresInSec * 1000) : null,
      },
    });
    return reply.code(201).send({ code: invite.code });
  });

  // ── Roles ───────────────────────────────────────────────────────────────
  const roleBody = z.object({
    name: z.string().min(1).max(100).optional(),
    color: z.string().max(16).optional(),
    permissions: z.string().optional(), // decimal-string bitfield
    hoist: z.boolean().optional(),
    mentionable: z.boolean().optional(),
  });

  app.post("/:guildId/roles", async (req, reply) => {
    const { guildId } = req.params as { guildId: string };
    if (!(await hasGuildPermission(req.userId, guildId, "MANAGE_ROLES"))) {
      return reply.code(403).send({ error: "Missing MANAGE_ROLES permission" });
    }
    const body = roleBody.parse(req.body ?? {});
    const top = await prisma.role.findFirst({ where: { guildId }, orderBy: { position: "desc" } });
    const role = await prisma.role.create({
      data: {
        guildId,
        name: body.name ?? "new role",
        color: body.color ?? "#99aab5",
        permissions: body.permissions ?? "0",
        hoist: body.hoist ?? false,
        mentionable: body.mentionable ?? false,
        position: (top?.position ?? 0) + 1,
      },
    });
    emitToGuild(guildId, "guild:rolesUpdate", { guildId });
    return reply.code(201).send(role);
  });

  app.patch("/:guildId/roles/:roleId", async (req, reply) => {
    const { guildId, roleId } = req.params as { guildId: string; roleId: string };
    if (!(await hasGuildPermission(req.userId, guildId, "MANAGE_ROLES"))) {
      return reply.code(403).send({ error: "Missing MANAGE_ROLES permission" });
    }
    const existing = await prisma.role.findUnique({ where: { id: roleId } });
    if (!existing || existing.guildId !== guildId) return reply.code(404).send({ error: "Not found" });

    const body = roleBody.parse(req.body ?? {});
    // @everyone can have its permissions tuned but keeps its name/hoist fixed.
    const data = existing.isDefault ? { permissions: body.permissions ?? existing.permissions } : body;
    const role = await prisma.role.update({ where: { id: roleId }, data });
    emitToGuild(guildId, "guild:rolesUpdate", { guildId });
    return reply.send(role);
  });

  app.delete("/:guildId/roles/:roleId", async (req, reply) => {
    const { guildId, roleId } = req.params as { guildId: string; roleId: string };
    if (!(await hasGuildPermission(req.userId, guildId, "MANAGE_ROLES"))) {
      return reply.code(403).send({ error: "Missing MANAGE_ROLES permission" });
    }
    const existing = await prisma.role.findUnique({ where: { id: roleId } });
    if (!existing || existing.guildId !== guildId) return reply.code(404).send({ error: "Not found" });
    if (existing.isDefault) return reply.code(400).send({ error: "Can't delete @everyone" });

    await prisma.role.delete({ where: { id: roleId } });
    emitToGuild(guildId, "guild:rolesUpdate", { guildId });
    return reply.code(204).send();
  });

  // Move a role up/down one slot (swap position with its neighbor).
  app.post("/:guildId/roles/:roleId/move", async (req, reply) => {
    const { guildId, roleId } = req.params as { guildId: string; roleId: string };
    if (!(await hasGuildPermission(req.userId, guildId, "MANAGE_ROLES"))) {
      return reply.code(403).send({ error: "Missing MANAGE_ROLES permission" });
    }
    const { direction } = z.object({ direction: z.enum(["up", "down"]) }).parse(req.body ?? {});
    const roles = await prisma.role.findMany({ where: { guildId }, orderBy: { position: "asc" } });
    const idx = roles.findIndex((r) => r.id === roleId);
    if (idx === -1) return reply.code(404).send({ error: "Not found" });
    const swapWith = direction === "up" ? idx + 1 : idx - 1;
    if (swapWith < 0 || swapWith >= roles.length) return reply.send({ ok: true }); // already at the edge

    await prisma.$transaction([
      prisma.role.update({ where: { id: roles[idx].id }, data: { position: roles[swapWith].position } }),
      prisma.role.update({ where: { id: roles[swapWith].id }, data: { position: roles[idx].position } }),
    ]);
    emitToGuild(guildId, "guild:rolesUpdate", { guildId });
    return reply.send({ ok: true });
  });

  // Assign / remove a role on a member.
  app.post("/:guildId/members/:userId/roles/:roleId", async (req, reply) => {
    const { guildId, userId, roleId } = req.params as { guildId: string; userId: string; roleId: string };
    if (!(await hasGuildPermission(req.userId, guildId, "MANAGE_ROLES"))) {
      return reply.code(403).send({ error: "Missing MANAGE_ROLES permission" });
    }
    const member = await prisma.guildMember.findUnique({ where: { guildId_userId: { guildId, userId } } });
    if (!member) return reply.code(404).send({ error: "Not a member" });
    await prisma.guildMember.update({ where: { id: member.id }, data: { roles: { connect: { id: roleId } } } });
    emitToGuild(guildId, "guild:memberAdd", { guildId }); // cheapest event that already refetches members
    return reply.send({ ok: true });
  });

  app.delete("/:guildId/members/:userId/roles/:roleId", async (req, reply) => {
    const { guildId, userId, roleId } = req.params as { guildId: string; userId: string; roleId: string };
    if (!(await hasGuildPermission(req.userId, guildId, "MANAGE_ROLES"))) {
      return reply.code(403).send({ error: "Missing MANAGE_ROLES permission" });
    }
    const member = await prisma.guildMember.findUnique({ where: { guildId_userId: { guildId, userId } } });
    if (!member) return reply.code(404).send({ error: "Not a member" });
    await prisma.guildMember.update({ where: { id: member.id }, data: { roles: { disconnect: { id: roleId } } } });
    emitToGuild(guildId, "guild:memberAdd", { guildId });
    return reply.send({ ok: true });
  });

  // ── Custom emoji ────────────────────────────────────────────────────────
  const EMOJI_MAX_BYTES = 2 * 1024 * 1024; // sanity cap distinct from the "no limit" attachment policy

  app.post("/:guildId/emojis", async (req, reply) => {
    const { guildId } = req.params as { guildId: string };
    if (!(await hasGuildPermission(req.userId, guildId, "MANAGE_EMOJIS"))) {
      return reply.code(403).send({ error: "Missing MANAGE_EMOJIS permission" });
    }
    const data = await req.file();
    if (!data) return reply.code(400).send({ error: "No file provided" });
    if (!/^image\//.test(data.mimetype)) return reply.code(400).send({ error: "Must be an image" });

    // Name travels as a query param (not a multipart field) — @fastify/multipart
    // only has non-file fields available if they're parsed before the file part
    // in the stream, which client-side FormData ordering can't be relied on.
    const { name: rawName } = req.query as { name?: string };
    const name = (rawName ?? data.filename.replace(/\.[^.]+$/, "")).toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 32);
    if (!name) return reply.code(400).send({ error: "Invalid emoji name" });
    if (await prisma.guildEmoji.findUnique({ where: { guildId_name: { guildId, name } } })) {
      return reply.code(409).send({ error: "An emoji with that name already exists" });
    }

    const dir = resolve(config.STORAGE_DIR);
    mkdirSync(dir, { recursive: true });
    const ext = data.mimetype.split("/")[1]?.replace("jpeg", "jpg") || "png";
    const stored = `emoji_${nanoid(12)}.${ext}`;
    const dest = join(dir, stored);
    await pipeline(data.file, createWriteStream(dest));
    if (data.file.truncated || statSync(dest).size > EMOJI_MAX_BYTES) {
      return reply.code(413).send({ error: "Emoji image is too large (max 2 MB)" });
    }

    const emoji = await prisma.guildEmoji.create({ data: { guildId, name, url: `/uploads/${stored}` } });
    emitToGuild(guildId, "guild:channelsUpdate", { guildId }); // cheap "refetch the guild" signal
    return reply.code(201).send(emoji);
  });

  app.delete("/:guildId/emojis/:emojiId", async (req, reply) => {
    const { guildId, emojiId } = req.params as { guildId: string; emojiId: string };
    if (!(await hasGuildPermission(req.userId, guildId, "MANAGE_EMOJIS"))) {
      return reply.code(403).send({ error: "Missing MANAGE_EMOJIS permission" });
    }
    const emoji = await prisma.guildEmoji.findUnique({ where: { id: emojiId } });
    if (!emoji || emoji.guildId !== guildId) return reply.code(404).send({ error: "Not found" });
    await prisma.guildEmoji.delete({ where: { id: emojiId } });
    emitToGuild(guildId, "guild:channelsUpdate", { guildId });
    return reply.code(204).send();
  });
}
