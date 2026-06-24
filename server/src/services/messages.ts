// Shared message persistence used by both the REST API and the socket gateway,
// so a message created either way is identical and broadcast once.
import { prisma } from "../lib/db.js";
import { config } from "../config.js";
import { getAccessibleChannel } from "./access.js";

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
}) {
  const content = opts.content?.trim() ?? "";
  const attachments = opts.attachments ?? [];
  // A message must have text or at least one attachment.
  if (!content && attachments.length === 0) throw new MessageError(400, "Message is empty");
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
