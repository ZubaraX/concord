// Per-channel "last read" timestamp (localStorage) — used to draw the
// "new messages" divider when reopening a channel.
const KEY = (id: string) => `concord.lastRead.${id}`;

export function getLastRead(channelId: string): number {
  return Number(localStorage.getItem(KEY(channelId)) || 0);
}

export function setLastRead(channelId: string, ts = Date.now()): void {
  localStorage.setItem(KEY(channelId), String(ts));
}
