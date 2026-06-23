import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";
import { authenticate } from "../lib/auth.js";
import { joinGuild } from "../services/guilds.js";

export async function inviteRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // Preview an invite (guild name/icon/member count) before joining.
  app.get("/invites/:code", async (req, reply) => {
    const { code } = req.params as { code: string };
    const invite = await prisma.invite.findUnique({
      where: { code },
      include: { guild: { include: { _count: { select: { members: true } } } } },
    });
    if (!invite) return reply.code(404).send({ error: "Invalid invite" });
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      return reply.code(410).send({ error: "Invite expired" });
    }
    return reply.send({
      code: invite.code,
      guild: {
        id: invite.guild.id,
        name: invite.guild.name,
        iconUrl: invite.guild.iconUrl,
        memberCount: invite.guild._count.members,
      },
    });
  });

  // Redeem an invite → join the guild.
  app.post("/invites/:code", async (req, reply) => {
    const { code } = req.params as { code: string };
    const invite = await prisma.invite.findUnique({ where: { code } });
    if (!invite) return reply.code(404).send({ error: "Invalid invite" });
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      return reply.code(410).send({ error: "Invite expired" });
    }
    if (invite.maxUses > 0 && invite.uses >= invite.maxUses) {
      return reply.code(410).send({ error: "Invite has reached its use limit" });
    }

    const member = await joinGuild(invite.guildId, req.userId);
    await prisma.invite.update({ where: { code }, data: { uses: { increment: 1 } } });

    const guild = await prisma.guild.findUnique({
      where: { id: invite.guildId },
      include: { channels: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] } },
    });
    return reply.code(201).send({ guild, member });
  });
}
