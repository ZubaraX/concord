import { create } from "zustand";

interface UIState {
  currentGuildId: string | null;
  currentChannelId: string | null;
  setGuild: (id: string | null) => void;
  setChannel: (id: string | null) => void;
}

export const useUI = create<UIState>((set) => ({
  currentGuildId: null,
  currentChannelId: null,
  setGuild: (id) => set({ currentGuildId: id, currentChannelId: null }),
  setChannel: (id) => set({ currentChannelId: id }),
}));
