// Shared message persistence used by both the REST API and the socket gateway,
// so a message created either way is identical and broadcast once.
import { prisma } from "../lib/db.js";
import { config } from "../config.js";

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
  replyTo: { include: { author: { select: authorSelect } } },
} as const;

export class MessageError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function createMessage(opts: {
  channelId: string;
  authorId: string;
  content: string;
  replyToId?: string;
}) {
  const content = opts.content?.trim() ?? "";
  if (!content) throw new MessageError(400, "Message is empty");
  if (content.length > config.MAX_MESSAGE_LENGTH) {
    throw new MessageError(413, `Message exceeds ${config.MAX_MESSAGE_LENGTH} chars`);
  }

  const channel = await prisma.channel.findUnique({ where: { id: opts.channelId } });
  if (!channel) throw new MessageError(404, "Channel not found");

  const member = await prisma.guildMember.findUnique({
    where: { guildId_userId: { guildId: channel.guildId, userId: opts.authorId } },
  });
  if (!member) throw new MessageError(403, "Not a member of this guild");

  return prisma.message.create({
    data: {
      channelId: opts.channelId,
      authorId: opts.authorId,
      content,
      replyToId: opts.replyToId,
    },
    include: messageInclude,
  });
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
