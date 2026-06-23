// Singleton Socket.io client with auto-reconnect + heartbeat. The access token
// is sent in the handshake auth and refreshed on connect.
import { io, type Socket } from "socket.io-client";
import { tokens } from "../api/client";
import { getServerUrl } from "./serverUrl";

let socket: Socket | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;

export function connectSocket(): Socket {
  if (socket?.connected) return socket;

  // Empty server URL → same-origin (web dev via Vite proxy).
  const base = getServerUrl();
  socket = io(base || undefined, {
    path: "/socket.io",
    auth: { token: tokens.access },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
  });

  socket.on("connect", () => {
    heartbeat = setInterval(() => socket?.emit("heartbeat"), 30_000);
  });

  socket.on("disconnect", () => {
    if (heartbeat) clearInterval(heartbeat);
  });

  // Refresh the handshake token on every reconnect attempt.
  socket.io.on("reconnect_attempt", () => {
    if (socket) socket.auth = { token: tokens.access };
  });

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  if (heartbeat) clearInterval(heartbeat);
  socket?.disconnect();
  socket = null;
}
