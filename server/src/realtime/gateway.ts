// Socket.io real-time gateway: presence, room joins, live messaging, typing.
// Single-instance, no Redis — presence is tracked in memory. Auth is the same
// JWT as the REST API.
import type { FastifyInstance } from "fastify";
import { Server } from "socket.io";
import { config } from "../config.js";
import { prisma } from "../lib/db.js";
import { addPresence, removePresence } from "../lib/presence.js";
import { createMessage, MessageError } from "../services/messages.js";
import { setIO, channelRoom, guildRoom, userRoom } from "./io.js";

interface SocketData {
  userId: string;
  username: string;
}

export function attachGateway(app: FastifyInstance) {
  const io = new Server<any, any, any, SocketData>(app.server, {
    cors: { origin: true, credentials: true }, // open: self-hosted, all-access
    maxHttpBufferSize: 1e8, // 100 MB — binary message support, no tiny cap
    transports: ["websocket", "polling"],
  });

  setIO(io);

  // ── Auth middleware: verify the access token from the handshake. ──
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error("Missing token"));
      const payload = app.jwt.verify<{ sub: string; username: string }>(token);
      socket.data.userId = payload.sub;
      socket.data.username = payload.username;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", async (socket) => {
    const { userId } = socket.data;

    // Personal room + presence.
    socket.join(userRoom(userId));
    const cameOnline = addPresence(userId);

    // Join the rooms for every guild this user belongs to.
    const memberships = await prisma.guildMember.findMany({
      where: { userId },
      select: { guildId: true },
    });
    for (const m of memberships) socket.join(guildRoom(m.guildId));

    if (cameOnline) {
      await prisma.user.update({ where: { id: userId }, data: { status: "ONLINE" } }).catch(() => {});
      for (const m of memberships) {
        io.to(guildRoom(m.guildId)).emit("presence:update", { userId, status: "ONLINE" });
      }
    }

    // Open/close a text channel to receive its live events.
    socket.on("channel:subscribe", (channelId: string) => {
      if (typeof channelId === "string") socket.join(channelRoom(channelId));
    });
    socket.on("channel:unsubscribe", (channelId: string) => {
      if (typeof channelId === "string") socket.leave(channelRoom(channelId));
    });

    // Send a message over the socket (low-latency path).
    interface SendPayload {
      channelId: string;
      content: string;
      replyToId?: string;
      attachments?: {
        url: string;
        filename: string;
        size: number;
        mimeType: string;
        width?: number | null;
        height?: number | null;
      }[];
    }
    socket.on("message:send", async (payload: SendPayload, ack?: (res: unknown) => void) => {
      try {
        const message = await createMessage({
          channelId: payload?.channelId,
          authorId: userId,
          content: payload?.content,
          replyToId: payload?.replyToId,
          attachments: payload?.attachments,
        });
        io.to(channelRoom(message.channelId)).emit("message:new", message);
        ack?.({ ok: true, message });
      } catch (err) {
        const msg = err instanceof MessageError ? err.message : "Failed to send";
        ack?.({ ok: false, error: msg });
      }
    });

    // Typing indicator (ephemeral; broadcast to others in the channel).
    socket.on("typing:start", (channelId: string) => {
      socket.to(channelRoom(channelId)).emit("typing:start", {
        channelId,
        userId,
        username: socket.data.username,
      });
    });

    socket.on("disconnect", async () => {
      const nowOffline = removePresence(userId);
      if (nowOffline) {
        await prisma.user
          .update({ where: { id: userId }, data: { status: "OFFLINE" } })
          .catch(() => {});
        for (const m of memberships) {
          io.to(guildRoom(m.guildId)).emit("presence:update", { userId, status: "OFFLINE" });
        }
      }
    });
  });

  return io;
}
