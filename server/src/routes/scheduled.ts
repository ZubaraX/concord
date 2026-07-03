// Send-later messages. Create/list/cancel here; lib/scheduler.ts polls for
// due ones and turns them into real messages through the normal pipeline.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { authenticate } from "../lib/auth.js";
import { getAccessibleChannel } from "../services/access.js";

const attachmentSchema = z.object({
  url: z.string(),
  filename: z.string(),
  size: z.number().int(),
  mimeType: z.string(),
  width: z.number().int().nullable().optional(),
  height: z.number().int().nullable().optional(),
});

export async function scheduledRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.post("/channels/:channelId/schedule", async (req, reply) => {
    const { channelId } = req.params as { channelId: string };
    const body = z
      .object({
        content: z.string().default(""),
        attachments: z.array(attachmentSchema).optional(),
        sendAt: z.string().datetime(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    if (!body.data.content.trim() && !body.data.attachments?.length) {
      return reply.code(400).send({ error: "Message is empty" });
    }
    const sendAt = new Date(body.data.sendAt);
    if (sendAt.getTime() <= Date.now()) return reply.code(400).send({ error: "sendAt must be in the future" });

    if (!(await getAccessibleChannel(req.userId, channelId))) {
      return reply.code(403).send({ error: "No access to this channel" });
    }

    const row = await prisma.scheduledMessage.create({
      data: {
        channelId,
        authorId: req.userId,
        content: body.data.content,
        attachmentsJson: body.data.attachments?.length ? JSON.stringify(body.data.attachments) : null,
        sendAt,
      },
    });
    return reply.code(201).send(row);
  });

  // Only your own pending scheduled messages for a channel (others can't see
  // what you haven't sent yet — same as Discord).
  app.get("/channels/:channelId/scheduled", async (req, reply) => {
    const { channelId } = req.params as { channelId: string };
    if (!(await getAccessibleChannel(req.userId, channelId))) {
      return reply.code(403).send({ error: "No access to this channel" });
    }
    const rows = await prisma.scheduledMessage.findMany({
      where: { channelId, authorId: req.userId },
      orderBy: { sendAt: "asc" },
    });
    return reply.send(rows);
  });

  app.delete("/scheduled/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await prisma.scheduledMessage.findUnique({ where: { id } });
    if (!row || row.authorId !== req.userId) return reply.code(404).send({ error: "Not found" });
    await prisma.scheduledMessage.delete({ where: { id } });
    return reply.code(204).send();
  });
}
