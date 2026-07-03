// Shared message persistence used by both the REST API and the socket gateway,
// so a message created either way is identical and broadcast once.
import { prisma } from "../lib/db.js";
import { config } from "../config.js";
import { getAccessibleChannel } from "./access.js";
import { getIOorNull, channelRoom, guildRoom, userRoom } from "../realtime/io.js";
import { pushToUser } from "../lib/push.js";

const authorSelect = {
  id: true,
  username: true,
  discriminator: true,
  displayName: true,
  avatarUrl: true,
} as const;

export const messageInclude = {
  author: { select: authorSelect },
  attachments: true,
  reactions: { select: { emoji: true, userId: true } },
  replyTo: { include: { author: { select: authorSelect } } },
} as const;

export class MessageError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface AttachmentInput {
  url: string;
  filename: string;
  size: number;
  mimeType: string;
  width?: number | null;
  height?: number | null;
}

export async function createMessage(opts: {
  channelId: string;
  authorId: string;
  content: string;
  replyToId?: string;
  attachments?: AttachmentInput[];
  pollJson?: string; // a poll "message" rides with empty content, see routes/messages.ts
}) {
  const content = opts.content?.trim() ?? "";
  const attachments = opts.attachments ?? [];
  // A message must have text, an attachment, or be a poll.
  if (!content && attachments.length === 0 && !opts.pollJson) throw new MessageError(400, "Message is empty");
  if (content.length > config.MAX_MESSAGE_LENGTH) {
    throw new MessageError(413, `Message exceeds ${config.MAX_MESSAGE_LENGTH} chars`);
  }

  const channel = await getAccessibleChannel(opts.authorId, opts.channelId);
  if (!channel) throw new MessageError(403, "No access to this channel");

  return prisma.message.create({
    data: {
      channelId: opts.channelId,
      authorId: opts.authorId,
      content,
      replyToId: opts.replyToId,
      pollJson: opts.pollJson,
      attachments: attachments.length
        ? {
            create: attachments.map((a) => ({
              url: a.url,
              filename: a.filename,
              size: a.size,
              mimeType: a.mimeType,
              width: a.width ?? null,
              height: a.height ?? null,
            })),
          }
        : undefined,
    },
    include: messageInclude,
  });
}

type CreatedMessage = Awaited<ReturnType<typeof createMessage>>;

/**
 * Resolve mention tokens in a message to guild-member user IDs. Supports
 * `@everyone`/`@here` (all members) and `@username` (case-insensitive). The
 * author is never returned (you don't get pinged by your own message).
 */
async function resolveMentions(content: string, guildId: string, authorId: string): Promise<string[]> {
  if (!content || !content.includes("@")) return [];
  const members = await prisma.guildMember.findMany({
    where: { guildId },
    select: { userId: true, user: { select: { username: true } } },
  });
  const out = new Set<string>();
  if (/@(everyone|here)\b/i.test(content)) {
    for (const m of members) out.add(m.userId);
  } else {
    const tokens = new Set(
      (content.match(/@([\p{L}\p{N}_.]+)/gu) ?? []).map((t) => t.slice(1).toLowerCase())
    );
    if (tokens.size) {
      for (const m of members) if (tokens.has(m.user.username.toLowerCase())) out.add(m.userId);
    }
  }
  out.delete(authorId);
  return [...out];
}

/**
 * Broadcast a freshly-created message to the channel, and for DMs also ping the
 * other participant's personal room so they get a notification when not viewing.
 */
export async function broadcastNewMessage(message: CreatedMessage) {
  const io = getIOorNull();
  if (!io) return;
  io.to(channelRoom(message.channelId)).emit("message:new", message);

  const channel = await prisma.channel.findUnique({
    where: { id: message.channelId },
    select: { guildId: true, dmParticipants: { select: { id: true } } },
  });
  const authorName = message.author.displayName ?? message.author.username;
  const preview = message.content?.slice(0, 160) || "📎 Вложение";
  if (channel?.guildId) {
    // Resolve @mentions (and @everyone/@here) against this guild's members so
    // mentioned users get a ping even when they're not viewing the channel.
    const mentions = await resolveMentions(message.content, channel.guildId, message.authorId);
    // Unread: let every guild member know this channel had activity.
    io.to(guildRoom(channel.guildId)).emit("channel:activity", {
      channelId: message.channelId,
      guildId: channel.guildId,
      authorId: message.authorId,
      authorName,
      content: (message.content ?? "").slice(0, 160),
      mentions,
    });
    for (const uid of mentions) {
      pushToUser(uid, {
        type: "mention",
        title: `${authorName} упомянул(а) вас`,
        body: preview,
        channelId: message.channelId,
        guildId: channel.guildId,
      });
    }
  } else if (channel) {
    for (const p of channel.dmParticipants) {
      if (p.id !== message.authorId) {
        io.to(userRoom(p.id)).emit("notify:dm", { channelId: message.channelId, message });
        pushToUser(p.id, { type: "dm", title: authorName, body: preview, channelId: message.channelId });
      }
    }
  }

  // Link previews: fetch OG metadata in the background, then update the message.
  void enrichEmbeds(message.id, message.content, message.channelId);
}

// ── Link-preview embeds ────────────────────────────────────────────────────
function pickMeta(html: string, prop: string): string | undefined {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i");
  const m = html.match(re) || html.match(
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, "i")
  );
  return m?.[1];
}

async function enrichEmbeds(messageId: string, content: string, channelId: string) {
  try {
    const url = content.match(/https?:\/\/[^\s<]+/)?.[0];
    if (!url) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "ConcordBot/1.0" } }).catch(() => null);
    clearTimeout(timer);
    if (!res || !res.ok) return;
    if (!(res.headers.get("content-type") || "").includes("text/html")) return;
    const html = (await res.text()).slice(0, 200_000);
    const decode = (s?: string) =>
      s?.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    const embed = {
      url,
      title: decode(pickMeta(html, "og:title") || html.match(/<title>([^<]*)<\/title>/i)?.[1]),
      description: decode(pickMeta(html, "og:description") || pickMeta(html, "description")),
      image: pickMeta(html, "og:image"),
      site: decode(pickMeta(html, "og:site_name")),
    };
    if (!embed.title && !embed.image) return;
    const embedsJson = JSON.stringify([embed]);
    const updated = await prisma.message.update({ where: { id: messageId }, data: { embedsJson }, include: messageInclude });
    getIOorNull()?.to(channelRoom(channelId)).emit("message:edit", updated);
  } catch {
    /* embeds are best-effort */
  }
}

// Cursor-paginated history (newest first). Full, unlimited history.
export async function listMessages(channelId: string, cursor?: string, limit = 50) {
  const take = Math.min(Math.max(limit, 1), 100);
  const messages = await prisma.message.findMany({
    where: { channelId },
    include: messageInclude,
    orderBy: { createdAt: "desc" },
    take,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  });
  return messages;
}
