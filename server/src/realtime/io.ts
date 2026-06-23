// Holds the live Socket.io server instance so REST handlers can broadcast
// without a circular import on the gateway module.
import type { Server } from "socket.io";

let io: Server | null = null;

export const setIO = (server: Server) => {
  io = server;
};

export const getIO = (): Server => {
  if (!io) throw new Error("Socket.io server not initialized");
  return io;
};

/** Non-throwing accessor for code paths that may run before the gateway boots. */
export const getIOorNull = (): Server | null => io;

export const channelRoom = (channelId: string) => `channel:${channelId}`;
export const guildRoom = (guildId: string) => `guild:${guildId}`;
export const userRoom = (userId: string) => `user:${userId}`;
