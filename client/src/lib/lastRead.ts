// Per-channel "last read" timestamp used for the "new messages" divider and
// the open-on-first-unread jump. Backed by the server (ReadState) so unread
// state is consistent across devices, with a localStorage mirror for instant
// reads and offline resilience.
import { api } from "../api/client";

const KEY = (id: string) => `concord.lastRead.${id}`;
const mem = new Map<string, number>();
const pending = new Map<string, ReturnType<typeof setTimeout>>();

/** Load all server-side read markers into memory (call once after login). */
export async function loadReadStates(): Promise<void> {
  try {
    const states = await api<{ channelId: string; lastReadAt: string }[]>("/api/read-states");
    for (const s of states) {
      const ts = new Date(s.lastReadAt).getTime();
      mem.set(s.channelId, ts);
      localStorage.setItem(KEY(s.channelId), String(ts));
    }
  } catch {
    /* offline / server down → fall back to whatever localStorage has */
  }
}

export function getLastRead(channelId: string): number {
  if (mem.has(channelId)) return mem.get(channelId)!;
  return Number(localStorage.getItem(KEY(channelId)) || 0);
}

export function setLastRead(channelId: string, ts = Date.now()): void {
  mem.set(channelId, ts);
  localStorage.setItem(KEY(channelId), String(ts));
  // Persist to the server, debounced — setLastRead fires on every incoming
  // message while a channel is open, and we don't want a request each time.
  clearTimeout(pending.get(channelId));
  pending.set(
    channelId,
    setTimeout(() => {
      pending.delete(channelId);
      api(`/api/channels/${channelId}/read`, { method: "PUT" }).catch(() => {});
    }, 2000)
  );
}

/** Mark every channel read (server + local mirror). */
export async function markAllRead(): Promise<void> {
  const now = Date.now();
  await api("/api/read-all", { method: "POST" }).catch(() => {});
  await loadReadStates().catch(() => {});
  // Ensure anything the server didn't return is at least locally current.
  for (const [id] of mem) mem.set(id, Math.max(mem.get(id) ?? 0, now));
}
