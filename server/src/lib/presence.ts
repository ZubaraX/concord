// In-memory presence tracking. For a single-instance (Codespaces / local)
// deployment this replaces Redis entirely — zero external services.
// Counts concurrent sockets per user so status flips to OFFLINE only when
// the user's last connection drops.
//
// To scale horizontally later, swap this module for a Redis-backed one and
// re-add the Socket.io Redis adapter in the gateway.

const sockets = new Map<string, number>();

/** Register a new connection. Returns true if the user just came online. */
export function addPresence(userId: string): boolean {
  const next = (sockets.get(userId) ?? 0) + 1;
  sockets.set(userId, next);
  return next === 1;
}

/** Drop a connection. Returns true if the user is now fully offline. */
export function removePresence(userId: string): boolean {
  const next = (sockets.get(userId) ?? 1) - 1;
  if (next <= 0) {
    sockets.delete(userId);
    return true;
  }
  sockets.set(userId, next);
  return false;
}

export function isOnline(userId: string): boolean {
  return sockets.has(userId);
}

export function onlineUserIds(): string[] {
  return [...sockets.keys()];
}
