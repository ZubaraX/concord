import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { authenticate } from "../lib/auth.js";
import { DEFAULT_EVERYONE_PERMISSIONS, ALL_PERMISSIONS } from "../lib/permissions.js";

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

  // Join an existing guild (open join for the MVP; invites come later).
  app.post("/:guildId/join", async (req, reply) => {
    const { guildId } = req.params as { guildId: string };
    const guild = await prisma.guild.findUnique({ where: { id: guildId } });
    if (!guild) return reply.code(404).send({ error: "Not found" });

    const everyone = await prisma.role.findFirst({
      where: { guildId, isDefault: true },
    });

    const member = await prisma.guildMember.upsert({
      where: { guildId_userId: { guildId, userId: req.userId } },
      update: {},
      create: {
        guildId,
        userId: req.userId,
        roles: everyone ? { connect: { id: everyone.id } } : undefined,
      },
    });
    return reply.code(201).send(member);
  });
}
