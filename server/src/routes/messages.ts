import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { authenticate } from "../lib/auth.js";
import { createMessage, listMessages, broadcastNewMessage, MessageError } from "../services/messages.js";
import { getAccessibleChannel } from "../services/access.js";
import { getIO, channelRoom } from "../realtime/io.js";

export async function messageRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // GET history (cursor-paginated, unlimited depth).
  app.get("/channels/:channelId/messages", async (req, reply) => {
    const { channelId } = req.params as { channelId: string };
    const { cursor, limit } = req.query as { cursor?: string; limit?: string };

    if (!(await getAccessibleChannel(req.userId, channelId))) {
      return reply.code(403).send({ error: "No access to this channel" });
    }

    const messages = await listMessages(channelId, cursor, limit ? Number(limit) : 50);
    return reply.send(messages.reverse()); // oldest → newest for rendering
  });

  // POST a message (REST path; the socket gateway shares createMessage()).
  app.post("/channels/:channelId/messages", async (req, reply) => {
    const { channelId } = req.params as { channelId: string };
    const attachmentSchema = z.object({
      url: z.string(),
      filename: z.string(),
      size: z.number().int(),
      mimeType: z.string(),
      width: z.number().int().nullable().optional(),
      height: z.number().int().nullable().optional(),
    });
    const body = z
      .object({
        content: z.string().default(""),
        replyToId: z.string().optional(),
        attachments: z.array(attachmentSchema).optional(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    try {
      const message = await createMessage({
        channelId,
        authorId: req.userId,
        content: body.data.content,
        replyToId: body.data.replyToId,
        attachments: body.data.attachments,
      });
      await broadcastNewMessage(message);
      return reply.code(201).send(message);
    } catch (err) {
      if (err instanceof MessageError) return reply.code(err.status).send({ error: err.message });
      throw err;
    }
  });

  app.patch("/messages/:messageId", async (req, reply) => {
    const { messageId } = req.params as { messageId: string };
    const { content } = z.object({ content: z.string().min(1) }).parse(req.body);

    const existing = await prisma.message.findUnique({ where: { id: messageId } });
    if (!existing) return reply.code(404).send({ error: "Not found" });
    if (existing.authorId !== req.userId) return reply.code(403).send({ error: "Not your message" });

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { content, editedAt: new Date() },
      include: { author: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
    });
    getIO().to(channelRoom(existing.channelId)).emit("message:edit", updated);
    return reply.send(updated);
  });

  app.delete("/messages/:messageId", async (req, reply) => {
    const { messageId } = req.params as { messageId: string };
    const existing = await prisma.message.findUnique({ where: { id: messageId } });
    if (!existing) return reply.code(404).send({ error: "Not found" });
    if (existing.authorId !== req.userId) return reply.code(403).send({ error: "Not your message" });

    await prisma.message.delete({ where: { id: messageId } });
    getIO()
      .to(channelRoom(existing.channelId))
      .emit("message:delete", { id: messageId, channelId: existing.channelId });
    return reply.code(204).send();
  });

  // ── Reactions ───────────────────────────────────────────────────────────
  async function reactableChannel(userId: string, messageId: string) {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { channelId: true },
    });
    if (!message) return null;
    const channel = await getAccessibleChannel(userId, message.channelId);
    return channel ? message.channelId : null;
  }

  // Add a reaction (emoji is URL-encoded by the client).
  app.put("/messages/:messageId/reactions/:emoji", async (req, reply) => {
    const { messageId, emoji } = req.params as { messageId: string; emoji: string };
    const channelId = await reactableChannel(req.userId, messageId);
    if (!channelId) return reply.code(403).send({ error: "No access" });

    await prisma.reaction.upsert({
      where: { messageId_userId_emoji: { messageId, userId: req.userId, emoji } },
      create: { messageId, userId: req.userId, emoji },
      update: {},
    });
    getIO().to(channelRoom(channelId)).emit("message:reaction", {
      channelId,
      messageId,
      emoji,
      userId: req.userId,
      added: true,
    });
    return reply.send({ ok: true });
  });

  // Remove a reaction.
  app.delete("/messages/:messageId/reactions/:emoji", async (req, reply) => {
    const { messageId, emoji } = req.params as { messageId: string; emoji: string };
    const channelId = await reactableChannel(req.userId, messageId);
    if (!channelId) return reply.code(403).send({ error: "No access" });

    await prisma.reaction.deleteMany({ where: { messageId, userId: req.userId, emoji } });
    getIO().to(channelRoom(channelId)).emit("message:reaction", {
      channelId,
      messageId,
      emoji,
      userId: req.userId,
      added: false,
    });
    return reply.code(200).send({ ok: true });
  });
}
