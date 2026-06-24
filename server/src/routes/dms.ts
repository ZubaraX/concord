import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { authenticate } from "../lib/auth.js";
import { getIOorNull, userRoom } from "../realtime/io.js";

const userSelect = {
  id: true,
  username: true,
  discriminator: true,
  displayName: true,
  avatarUrl: true,
  status: true,
} as const;

async function areFriends(a: string, b: string) {
  const f = await prisma.friendship.findFirst({
    where: {
      status: "ACCEPTED",
      OR: [
        { requesterId: a, addresseeId: b },
        { requesterId: b, addresseeId: a },
      ],
    },
  });
  return !!f;
}

// Shape a DM channel for the client: the "name" is the other participant.
function shapeDM(channel: { id: string; dmParticipants: { id: string; username: string; discriminator: string; displayName: string | null; avatarUrl: string | null; status: string }[] }, meId: string) {
  const other = channel.dmParticipants.find((p) => p.id !== meId) ?? channel.dmParticipants[0];
  return {
    id: channel.id,
    type: "DM" as const,
    guildId: null,
    name: other?.displayName ?? other?.username ?? "Direct Message",
    otherUser: other,
    participants: channel.dmParticipants,
  };
}

export async function dmRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // List my DM conversations.
  app.get("/", async (req) => {
    const channels = await prisma.channel.findMany({
      where: { type: "DM", dmParticipants: { some: { id: req.userId } } },
      include: { dmParticipants: { select: userSelect } },
      orderBy: { createdAt: "desc" },
    });
    return channels.map((c) => shapeDM(c, req.userId));
  });

  // Open (get-or-create) a DM with a friend.
  app.post("/", async (req, reply) => {
    const body = z.object({ userId: z.string() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "userId required" });
    const otherId = body.data.userId;
    if (otherId === req.userId) return reply.code(400).send({ error: "Cannot DM yourself" });
    if (!(await areFriends(req.userId, otherId))) {
      return reply.code(403).send({ error: "You can only DM friends" });
    }

    // Find an existing 1:1 DM containing both users.
    const existing = await prisma.channel.findFirst({
      where: {
        type: "DM",
        AND: [
          { dmParticipants: { some: { id: req.userId } } },
          { dmParticipants: { some: { id: otherId } } },
        ],
      },
      include: { dmParticipants: { select: userSelect } },
    });
    if (existing) return reply.send(shapeDM(existing, req.userId));

    const channel = await prisma.channel.create({
      data: {
        type: "DM",
        name: "DM",
        dmParticipants: { connect: [{ id: req.userId }, { id: otherId }] },
      },
      include: { dmParticipants: { select: userSelect } },
    });

    // Let the other user's client know a new DM exists.
    getIOorNull()?.to(userRoom(otherId)).emit("dm:new", { channelId: channel.id });
    return reply.code(201).send(shapeDM(channel, req.userId));
  });
}
