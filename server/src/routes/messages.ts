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
    const raw = (q ?? "").trim();

    // Parse filter tokens: from:username, has:link, has:file. The rest is text.
    let fromUser: string | null = null;
    let hasLink = false;
    let hasFile = false;
    const textParts: string[] = [];
    for (const tok of raw.split(/\s+/)) {
      const from = /^from:(.+)$/i.exec(tok);
      if (from) { fromUser = from[1].replace(/^@/, ""); continue; }
      if (/^has:link$/i.test(tok)) { hasLink = true; continue; }
      if (/^has:(file|image|attachment)$/i.test(tok)) { hasFile = true; continue; }
      if (tok) textParts.push(tok);
    }
    const query = textParts.join(" ");
    if (query.length < 2 && !fromUser && !hasLink && !hasFile) {
      return reply.code(400).send({ error: "Query too short (min 2 chars) or add a filter" });
    }

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

    // Case-variant contains() because SQLite LIKE is case-sensitive for Cyrillic.
    const AND: Record<string, unknown>[] = [];
    if (query.length >= 2) {
      const cap = query.charAt(0).toUpperCase() + query.slice(1).toLowerCase();
      const variants = [...new Set([query, query.toLowerCase(), query.toUpperCase(), cap])];
      AND.push({ OR: variants.map((v) => ({ content: { contains: v } })) });
    }
    if (fromUser) AND.push({ author: { username: { contains: fromUser } } });
    if (hasLink) AND.push({ content: { contains: "http" } });
    if (hasFile) AND.push({ attachments: { some: {} } });

    const messages = await prisma.message.findMany({
      where: {
        // Guild scope skips THREAD channels — a search hit inside a hidden
        // thread can't be jumped to from the main chat view.
        ...(channelId ? { channelId } : { channel: { guildId, type: { not: "THREAD" } } }),
        AND,
      },
      include: messageInclude,
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return reply.send(messages);
  });

  // ── Threads ──────────────────────────────────────────────────────────────
  // Create (or return) the discussion thread hanging off a message. A thread
  // is a hidden channel of type THREAD in the same guild — all the existing
  // message machinery (history, posting, reactions, sockets) works inside it.
  app.post("/messages/:messageId/thread", async (req, reply) => {
    const { messageId } = req.params as { messageId: string };
    const msg = await prisma.message.findUnique({
      where: { id: messageId },
      include: { channel: { select: { type: true, guildId: true } } },
    });
    if (!msg) return reply.code(404).send({ error: "Not found" });
    if (!(await getAccessibleChannel(req.userId, msg.channelId))) {
      return reply.code(403).send({ error: "No access to this channel" });
    }
    if (msg.channel.type !== "TEXT" || !msg.channel.guildId) {
      return reply.code(400).send({ error: "Threads are only available in server text channels" });
    }

    // Already has one → return it (idempotent open).
    if (msg.threadId) {
      const existing = await prisma.channel.findUnique({ where: { id: msg.threadId } });
      if (existing) return reply.send(existing);
    }

    const name = (msg.content || "").replace(/\s+/g, " ").trim().slice(0, 60) || "thread";
    const thread = await prisma.channel.create({
      data: {
        guildId: msg.channel.guildId,
        name,
        type: "THREAD",
        parentId: msg.channelId,
        position: 100000, // sorted last; never shown in the sidebar anyway
      },
    });
    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { threadId: thread.id },
      include: messageInclude,
    });
    // Everyone viewing the parent channel sees the thread chip appear live.
    getIO().to(channelRoom(msg.channelId)).emit("message:edit", updated);
    return reply.send(thread);
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

  // ── Read state (syncs unread across devices) ────────────────────────────
  // All my last-read markers, for computing unread on load.
  app.get("/read-states", async (req) => {
    const states = await prisma.readState.findMany({ where: { userId: req.userId } });
    return states.map((s) => ({ channelId: s.channelId, lastReadAt: s.lastReadAt }));
  });

  // Mark a channel read up to now.
  app.put("/channels/:channelId/read", async (req, reply) => {
    const { channelId } = req.params as { channelId: string };
    const at = new Date();
    await prisma.readState.upsert({
      where: { userId_channelId: { userId: req.userId, channelId } },
      create: { userId: req.userId, channelId, lastReadAt: at },
      update: { lastReadAt: at },
    });
    // DM read receipt: tell the room so the other side's "✓ Seen" updates live.
    const ch = await prisma.channel.findUnique({ where: { id: channelId }, select: { guildId: true } });
    if (ch && !ch.guildId) {
      getIO().to(channelRoom(channelId)).emit("read:receipt", { channelId, userId: req.userId, lastReadAt: at });
    }
    return reply.send({ ok: true, lastReadAt: at });
  });

  // Read receipts for a DM: other participants' last-read timestamps.
  app.get("/channels/:channelId/read-receipt", async (req, reply) => {
    const { channelId } = req.params as { channelId: string };
    const channel = await getAccessibleChannel(req.userId, channelId);
    if (!channel) return reply.code(404).send({ error: "Not found" });
    if (channel.guildId) return reply.send({ readers: [] }); // DMs only
    const otherIds = channel.dmParticipants.map((p) => p.id).filter((id) => id !== req.userId);
    const states = await prisma.readState.findMany({ where: { channelId, userId: { in: otherIds } } });
    return reply.send({ readers: states.map((s) => ({ userId: s.userId, lastReadAt: s.lastReadAt })) });
  });

  // Mark every accessible channel read (guild channels I'm a member of + my DMs).
  app.post("/read-all", async (req) => {
    const memberships = await prisma.guildMember.findMany({
      where: { userId: req.userId },
      select: { guild: { select: { channels: { select: { id: true } } } } },
    });
    const dmChannels = await prisma.channel.findMany({
      where: { type: "DM", dmParticipants: { some: { id: req.userId } } },
      select: { id: true },
    });
    const ids = [
      ...memberships.flatMap((m) => m.guild.channels.map((c) => c.id)),
      ...dmChannels.map((c) => c.id),
    ];
    const at = new Date();
    await prisma.$transaction(
      ids.map((channelId) =>
        prisma.readState.upsert({
          where: { userId_channelId: { userId: req.userId, channelId } },
          create: { userId: req.userId, channelId, lastReadAt: at },
          update: { lastReadAt: at },
        })
      )
    );
    return { ok: true, count: ids.length };
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
