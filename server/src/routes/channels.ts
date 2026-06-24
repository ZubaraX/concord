import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { authenticate } from "../lib/auth.js";
import { emitToGuild } from "../services/guilds.js";
import { getAccessibleChannel } from "../services/access.js";

const dmUserSelect = {
  id: true,
  username: true,
  discriminator: true,
  displayName: true,
  avatarUrl: true,
  status: true,
} as const;

const createBody = z.object({
  guildId: z.string(),
  name: z.string().min(1).max(100),
  type: z.enum(["TEXT", "VOICE", "CATEGORY", "ANNOUNCEMENT", "FORUM", "STAGE"]).default("TEXT"),
  parentId: z.string().optional(),
  topic: z.string().max(1024).optional(),
  // No caps: bitrate can go up to lossless; userLimit 0 = unlimited.
  bitrate: z.number().int().min(8000).max(512000).optional(),
});

async function assertMember(userId: string, guildId: string) {
  return prisma.guildMember.findUnique({
    where: { guildId_userId: { guildId, userId } },
  });
}

export async function channelRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // Channel info by id — works for guild channels and DM channels.
  app.get("/:channelId", async (req, reply) => {
    const { channelId } = req.params as { channelId: string };
    const ch = await getAccessibleChannel(req.userId, channelId);
    if (!ch) return reply.code(404).send({ error: "Not found" });

    if (!ch.guildId) {
      const full = await prisma.channel.findUnique({
        where: { id: channelId },
        include: { dmParticipants: { select: dmUserSelect } },
      });
      const other = full!.dmParticipants.find((p) => p.id !== req.userId) ?? full!.dmParticipants[0];
      return reply.send({
        id: ch.id,
        type: "DM",
        guildId: null,
        name: other?.displayName ?? other?.username ?? "Direct Message",
        otherUser: other,
        participants: full!.dmParticipants,
      });
    }
    return reply.send({ id: ch.id, name: ch.name, type: ch.type, topic: ch.topic, guildId: ch.guildId });
  });

  app.post("/", async (req, reply) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { guildId, ...data } = parsed.data;

    if (!(await assertMember(req.userId, guildId))) {
      return reply.code(403).send({ error: "Not a member" });
    }

    const count = await prisma.channel.count({ where: { guildId } });
    const channel = await prisma.channel.create({
      data: { guildId, position: count, ...data },
    });
    emitToGuild(guildId, "guild:channelsUpdate", { guildId });
    return reply.code(201).send(channel);
  });

  app.patch("/:channelId", async (req, reply) => {
    const { channelId } = req.params as { channelId: string };
    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel?.guildId) return reply.code(404).send({ error: "Not found" });
    if (!(await assertMember(req.userId, channel.guildId))) {
      return reply.code(403).send({ error: "Not a member" });
    }

    const body = z
      .object({
        name: z.string().min(1).max(100).optional(),
        topic: z.string().max(1024).optional(),
        slowmode: z.number().int().min(0).optional(),
        position: z.number().int().optional(),
      })
      .parse(req.body ?? {});

    const updated = await prisma.channel.update({ where: { id: channelId }, data: body });
    emitToGuild(channel.guildId, "guild:channelsUpdate", { guildId: channel.guildId });
    return reply.send(updated);
  });

  app.delete("/:channelId", async (req, reply) => {
    const { channelId } = req.params as { channelId: string };
    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel?.guildId) return reply.code(404).send({ error: "Not found" });
    if (!(await assertMember(req.userId, channel.guildId))) {
      return reply.code(403).send({ error: "Not a member" });
    }
    await prisma.channel.delete({ where: { id: channelId } });
    emitToGuild(channel.guildId, "guild:channelsUpdate", { guildId: channel.guildId });
    return reply.code(204).send();
  });
}
