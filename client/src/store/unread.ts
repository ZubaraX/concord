import { create } from "zustand";

// Per-channel unread message counts (in-memory; reset on app restart).
interface UnreadStore {
  counts: Record<string, number>;
  bump: (channelId: string) => void;
  clear: (channelId: string) => void;
}

export const useUnread = create<UnreadStore>((set) => ({
  counts: {},
  bump: (channelId) => set((s) => ({ counts: { ...s.counts, [channelId]: (s.counts[channelId] || 0) + 1 } })),
  clear: (channelId) =>
    set((s) => {
      if (!s.counts[channelId]) return s;
      const c = { ...s.counts };
      delete c[channelId];
      return { counts: c };
    }),
}));
