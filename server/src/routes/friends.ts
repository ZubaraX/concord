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

function notify(userId: string, event: string, payload: unknown) {
  getIOorNull()?.to(userRoom(userId)).emit(event, payload);
}

export async function friendRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // Accepted friends (either direction).
  app.get("/", async (req) => {
    const rows = await prisma.friendship.findMany({
      where: { status: "ACCEPTED", OR: [{ requesterId: req.userId }, { addresseeId: req.userId }] },
      include: { requester: { select: userSelect }, addressee: { select: userSelect } },
    });
    return rows.map((f) => ({
      id: f.id,
      since: f.createdAt,
      user: f.requesterId === req.userId ? f.addressee : f.requester,
    }));
  });

  // Pending requests, split into incoming (I can accept) and outgoing.
  app.get("/pending", async (req) => {
    const rows = await prisma.friendship.findMany({
      where: { status: "PENDING", OR: [{ requesterId: req.userId }, { addresseeId: req.userId }] },
      include: { requester: { select: userSelect }, addressee: { select: userSelect } },
    });
    return {
      incoming: rows.filter((f) => f.addresseeId === req.userId).map((f) => ({ id: f.id, user: f.requester })),
      outgoing: rows.filter((f) => f.requesterId === req.userId).map((f) => ({ id: f.id, user: f.addressee })),
    };
  });

  // Send a friend request by username#discriminator.
  app.post("/request", async (req, reply) => {
    const body = z
      .object({ username: z.string().min(1), discriminator: z.string().length(4) })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "Use username and 4-digit tag" });

    const target = await prisma.user.findUnique({
      where: { username_discriminator: { username: body.data.username, discriminator: body.data.discriminator } },
    });
    if (!target) return reply.code(404).send({ error: "No user with that tag" });
    if (target.id === req.userId) return reply.code(400).send({ error: "You can't add yourself" });

    // Existing relationship in either direction?
    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: req.userId, addresseeId: target.id },
          { requesterId: target.id, addresseeId: req.userId },
        ],
      },
    });
    if (existing) {
      if (existing.status === "ACCEPTED") return reply.code(409).send({ error: "Already friends" });
      // If they already sent me one, accept it instead of duplicating.
      if (existing.addresseeId === req.userId) {
        const accepted = await prisma.friendship.update({ where: { id: existing.id }, data: { status: "ACCEPTED" } });
        notify(existing.requesterId, "friend:accept", { id: accepted.id });
        return reply.send({ ok: true, accepted: true });
      }
      return reply.code(409).send({ error: "Request already pending" });
    }

    const fr = await prisma.friendship.create({
      data: { requesterId: req.userId, addresseeId: target.id, status: "PENDING" },
    });
    notify(target.id, "friend:request", { id: fr.id });
    return reply.code(201).send({ ok: true });
  });

  // Accept an incoming request.
  app.post("/:id/accept", async (req, reply) => {
    const { id } = req.params as { id: string };
    const fr = await prisma.friendship.findUnique({ where: { id } });
    if (!fr || fr.addresseeId !== req.userId) return reply.code(404).send({ error: "Not found" });
    await prisma.friendship.update({ where: { id }, data: { status: "ACCEPTED" } });
    notify(fr.requesterId, "friend:accept", { id });
    return reply.send({ ok: true });
  });

  // Decline / cancel / unfriend.
  app.delete("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const fr = await prisma.friendship.findUnique({ where: { id } });
    if (!fr || (fr.requesterId !== req.userId && fr.addresseeId !== req.userId)) {
      return reply.code(404).send({ error: "Not found" });
    }
    await prisma.friendship.delete({ where: { id } });
    notify(fr.requesterId === req.userId ? fr.addresseeId : fr.requesterId, "friend:remove", { id });
    return reply.code(204).send();
  });
}
