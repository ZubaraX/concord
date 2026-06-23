import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { authenticate } from "../lib/auth.js";
import { createMessage, listMessages, MessageError } from "../services/messages.js";
import { getIO, channelRoom } from "../realtime/io.js";

export async function messageRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // GET history (cursor-paginated, unlimited depth).
  app.get("/channels/:channelId/messages", async (req, reply) => {
    const { channelId } = req.params as { channelId: string };
    const { cursor, limit } = req.query as { cursor?: string; limit?: string };

    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) return reply.code(404).send({ error: "Channel not found" });
    const member = await prisma.guildMember.findUnique({
      where: { guildId_userId: { guildId: channel.guildId, userId: req.userId } },
    });
    if (!member) return reply.code(403).send({ error: "Not a member" });

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
      getIO().to(channelRoom(channelId)).emit("message:new", message);
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
}
