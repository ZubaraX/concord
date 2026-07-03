// Background loop for send-later messages. Single-instance, no queue — same
// philosophy as lib/presence.ts: a cheap setInterval scan is plenty at this
// scale and needs zero extra infrastructure.
import { prisma } from "./db.js";
import { createMessage, broadcastNewMessage, type AttachmentInput } from "../services/messages.js";

const POLL_MS = 15_000;

async function sendDue() {
  const due = await prisma.scheduledMessage.findMany({ where: { sendAt: { lte: new Date() } } });
  for (const row of due) {
    try {
      // Delete first so a slow send can never be picked up twice by an
      // overlapping tick.
      await prisma.scheduledMessage.deleteMany({ where: { id: row.id } });
      const attachments: AttachmentInput[] | undefined = row.attachmentsJson
        ? JSON.parse(row.attachmentsJson)
        : undefined;
      const message = await createMessage({
        channelId: row.channelId,
        authorId: row.authorId,
        content: row.content,
        attachments,
      });
      await broadcastNewMessage(message);
    } catch (err) {
      console.error("[scheduler] failed to send scheduled message", row.id, err);
    }
  }
}

export function startScheduler() {
  setInterval(() => void sendDue(), POLL_MS);
  void sendDue(); // catch up on anything overdue from before the last restart
}
