import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { nanoid } from "nanoid";
import { prisma } from "../lib/db.js";
import { authenticate } from "../lib/auth.js";
import { createMessage, listMessages, broadcastNewMessage, messageInclude, MessageError } from "../services/messages.js";
import { getAccessibleChannel } from "../services/access.js";
import { getIO, channelRoom } from "../realtime/io.js";

interface PollData {
  question: string;
  options: { id: string; label: string }[];
  votes: Record<string, string[]>; // optionId -> userIds
}

export async function messageRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // Message search: one channel (DM) or a whole guild. SQLite LIKE is
  // case-sensitive for non-ASCII (Cyrillic!), so we match several case
  // variants of the query — good enough without a full FTS index.
  app.get("/search", async (req, reply) => {
    const { q, guildId, channelId } = req.query as { q?: string; guildId?: string; channelId?: string };
    const query = (q ?? "").trim();
    if (query.length < 2) return reply.code(400).send({ error: "Query too short (min 2 chars)" });

    if (channelId) {
      if (!(await getAccessibleChannel(req.userId, channelId))) {
        return reply.code(403).send({ error: "No access to this channel" });
      }
    } else if (guildId) {
      const member = await prisma.guildMember.findUnique({
        where: { guildId_userId: { guildId, userId: req.userId } },
      });
      if (!member) return reply.code(403).send({ error: "Not a member of this guild" });
    } else {
      return reply.code(400).send({ error: "guildId or channelId required" });
    }

    const capitalized = query.charAt(0).toUpperCase() + query.slice(1).toLowerCase();
    const variants = [...new Set([query, query.toLowerCase(), query.toUpperCase(), capitalized])];
    const messages = await prisma.message.findMany({
      where: {
        ...(channelId ? { channelId } : { channel: { guildId } }),
        OR: variants.map((v) => ({ content: { contains: v } })),
      },
      include: messageInclude,
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return reply.send(messages);
  });

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

  // ── Pins ──────────────────────────────────────────────────────────────
  async function setPinned(userId: string, messageId: string, pinned: boolean, reply: import("fastify").FastifyReply) {
    const channelId = await reactableChannel(userId, messageId);
    if (!channelId) return reply.code(403).send({ error: "No access" });
    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { pinned },
      include: messageInclude,
    });
    getIO().to(channelRoom(channelId)).emit("message:edit", updated);
    return reply.send({ ok: true });
  }

  app.put("/messages/:messageId/pin", (req, reply) =>
    setPinned(req.userId, (req.params as { messageId: string }).messageId, true, reply)
  );
  app.delete("/messages/:messageId/pin", (req, reply) =>
    setPinned(req.userId, (req.params as { messageId: string }).messageId, false, reply)
  );

  // List pinned messages of a channel.
  app.get("/channels/:channelId/pins", async (req, reply) => {
    const { channelId } = req.params as { channelId: string };
    if (!(await getAccessibleChannel(req.userId, channelId))) {
      return reply.code(403).send({ error: "No access" });
    }
    const pins = await prisma.message.findMany({
      where: { channelId, pinned: true },
      include: messageInclude,
      orderBy: { createdAt: "desc" },
    });
    return reply.send(pins);
  });

  // ── Polls ─────────────────────────────────────────────────────────────
  // A poll rides along as a normal (empty-content) message with `pollJson`
  // populated — it gets full message-pipeline treatment (broadcast, push,
  // history, search) for free.
  app.post("/channels/:channelId/poll", async (req, reply) => {
    const { channelId } = req.params as { channelId: string };
    const body = z
      .object({ question: z.string().min(1).max(300), options: z.array(z.string().min(1).max(80)).min(2).max(10) })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    try {
      const poll: PollData = {
        question: body.data.question,
        options: body.data.options.map((label) => ({ id: nanoid(6), label })),
        votes: {},
      };
      const message = await createMessage({ channelId, authorId: req.userId, content: "", pollJson: JSON.stringify(poll) });
      await broadcastNewMessage(message);
      return reply.code(201).send(message);
    } catch (err) {
      if (err instanceof MessageError) return reply.code(err.status).send({ error: err.message });
      throw err;
    }
  });

  // Single-choice voting: picking a new option clears any previous vote.
  app.put("/messages/:messageId/poll/vote", async (req, reply) => {
    const { messageId } = req.params as { messageId: string };
    const { optionId } = z.object({ optionId: z.string() }).parse(req.body);

    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message?.pollJson) return reply.code(404).send({ error: "Not a poll" });
    const channelId = await reactableChannel(req.userId, messageId);
    if (!channelId) return reply.code(403).send({ error: "No access" });

    const poll: PollData = JSON.parse(message.pollJson);
    if (!poll.options.some((o) => o.id === optionId)) return reply.code(400).send({ error: "Unknown option" });

    const alreadyVoted = poll.votes[optionId]?.includes(req.userId);
    for (const id of Object.keys(poll.votes)) {
      poll.votes[id] = poll.votes[id].filter((u) => u !== req.userId);
    }
    if (!alreadyVoted) {
      poll.votes[optionId] = [...(poll.votes[optionId] ?? []), req.userId];
    }

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { pollJson: JSON.stringify(poll) },
      include: messageInclude,
    });
    getIO().to(channelRoom(channelId)).emit("message:edit", updated);
    return reply.send(updated);
  });
}
