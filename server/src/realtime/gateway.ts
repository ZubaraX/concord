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

// Voice occupancy: channelId -> (socketId -> userId). Used to relay WebRTC
// signaling (P2P mesh) and to show who's in each voice channel.
const voiceParticipants = new Map<string, Map<string, string>>();
const voiceRoom = (channelId: string) => `voice:${channelId}`;

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

  io.on("connection", (socket) => {
    const { userId } = socket.data;

    // Guilds this socket belongs to (filled during async setup below).
    let memberships: { guildId: string }[] = [];
    // Track which voice channel this socket is in (for cleanup on disconnect).
    let currentVoice: string | null = null;

    const broadcastVoiceState = async (channelId: string) => {
      const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        select: { guildId: true, dmParticipants: { select: { id: true } } },
      });
      if (!channel) return;
      const map = voiceParticipants.get(channelId);
      const payload = { channelId, userIds: map ? [...new Set(map.values())] : [] };
      if (channel.guildId) {
        io.to(guildRoom(channel.guildId)).emit("voice:state", payload);
      } else {
        // DM call → notify both participants' personal rooms.
        for (const p of channel.dmParticipants) io.to(userRoom(p.id)).emit("voice:state", payload);
      }
    };

    const leaveVoiceChannel = (channelId: string) => {
      const map = voiceParticipants.get(channelId);
      if (map) {
        map.delete(socket.id);
        if (map.size === 0) voiceParticipants.delete(channelId);
      }
      socket.leave(voiceRoom(channelId));
      socket.to(voiceRoom(channelId)).emit("voice:peerLeft", { socketId: socket.id, userId });
    };

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

    // ── Voice (WebRTC P2P mesh) signaling ──────────────────────────────
    socket.on(
      "voice:join",
      async ({ channelId }: { channelId: string }, ack?: (res: unknown) => void) => {
        const channel = await prisma.channel.findUnique({ where: { id: channelId } });
        if (!channel) return ack?.({ ok: false, error: "Channel not found" });

        if (currentVoice && currentVoice !== channelId) {
          leaveVoiceChannel(currentVoice);
          broadcastVoiceState(currentVoice);
        }
        currentVoice = channelId;
        socket.join(voiceRoom(channelId));

        const map = voiceParticipants.get(channelId) ?? new Map<string, string>();
        // existing peers BEFORE adding self → the joiner connects to them
        const peers = [...map.entries()].map(([socketId, uid]) => ({ socketId, userId: uid }));
        map.set(socket.id, userId);
        voiceParticipants.set(channelId, map);

        socket.to(voiceRoom(channelId)).emit("voice:peerJoined", { socketId: socket.id, userId });
        ack?.({ ok: true, peers });
        broadcastVoiceState(channelId);
      }
    );

    socket.on("voice:leave", ({ channelId }: { channelId: string }) => {
      leaveVoiceChannel(channelId);
      if (currentVoice === channelId) currentVoice = null;
      broadcastVoiceState(channelId);
    });

    // Relay an SDP description or ICE candidate to a specific peer socket.
    socket.on(
      "voice:signal",
      (payload: { to: string; description?: unknown; candidate?: unknown }) => {
        if (!payload?.to) return;
        io.to(payload.to).emit("voice:signal", {
          from: socket.id,
          fromUserId: userId,
          description: payload.description,
          candidate: payload.candidate,
        });
      }
    );

    socket.on("disconnect", async () => {
      if (currentVoice) {
        const ch = currentVoice;
        leaveVoiceChannel(ch);
        currentVoice = null;
        broadcastVoiceState(ch);
      }
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

    // ── Async setup (runs after all handlers are registered, so a slow or
    //    failing query can never prevent a handler from being wired up). ──
    void (async () => {
      socket.join(userRoom(userId));
      const cameOnline = addPresence(userId);

      memberships = await prisma.guildMember.findMany({
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

      // Snapshot current voice occupancy for the user's voice channels.
      const voiceChannels = await prisma.channel.findMany({
        where: { guildId: { in: memberships.map((m) => m.guildId) }, type: "VOICE" },
        select: { id: true },
      });
      for (const ch of voiceChannels) {
        const map = voiceParticipants.get(ch.id);
        if (map?.size) socket.emit("voice:state", { channelId: ch.id, userIds: [...new Set(map.values())] });
      }
    })().catch((err) => app.log.error({ err }, "socket setup failed"));
  });

  return io;
}
