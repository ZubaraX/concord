// Muted channels/servers — local-only (like Discord's per-device mute).
// A muted channel produces no unread bumps, pings, toasts or desktop popups.
import { create } from "zustand";

const KEY = "concord.mutes";

interface Mutes {
  channels: string[];
  guilds: string[];
}
const load = (): Mutes => {
  try {
    const m = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return { channels: m.channels ?? [], guilds: m.guilds ?? [] };
  } catch {
    return { channels: [], guilds: [] };
  }
};
const save = (m: Mutes) => localStorage.setItem(KEY, JSON.stringify(m));

interface MuteStore extends Mutes {
  toggleChannel: (id: string) => void;
  toggleGuild: (id: string) => void;
}

const toggle = (list: string[], id: string) =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

export const useMutes = create<MuteStore>((set, get) => ({
  ...load(),
  toggleChannel: (id) => {
    const next = { channels: toggle(get().channels, id), guilds: get().guilds };
    save(next);
    set(next);
  },
  toggleGuild: (id) => {
    const next = { channels: get().channels, guilds: toggle(get().guilds, id) };
    save(next);
    set(next);
  },
}));

/** True when this channel (or its whole guild) is muted. */
export function isMuted(channelId?: string | null, guildId?: string | null): boolean {
  const s = useMutes.getState();
  return (!!channelId && s.channels.includes(channelId)) || (!!guildId && s.guilds.includes(guildId));
}
