import { create } from "zustand";

export type ModalKind = "addServer" | "settings" | "invite";

interface UIState {
  currentGuildId: string | null;
  currentChannelId: string | null;
  modal: ModalKind | null;
  setGuild: (id: string | null) => void;
  setChannel: (id: string | null) => void;
  openDM: (channelId: string) => void; // home view, a DM conversation
  openFriends: () => void; // home view, friends list
  openModal: (m: ModalKind) => void;
  closeModal: () => void;
}

export const useUI = create<UIState>((set) => ({
  currentGuildId: null,
  currentChannelId: null,
  modal: null,
  setGuild: (id) => set({ currentGuildId: id, currentChannelId: null }),
  setChannel: (id) => set({ currentChannelId: id }),
  openDM: (channelId) => set({ currentGuildId: null, currentChannelId: channelId }),
  openFriends: () => set({ currentGuildId: null, currentChannelId: null }),
  openModal: (m) => set({ modal: m }),
  closeModal: () => set({ modal: null }),
}));
