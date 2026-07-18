import { create } from "zustand";

export type ModalKind = "addServer" | "settings" | "invite";

interface UIState {
  currentGuildId: string | null;
  currentChannelId: string | null;
  modal: ModalKind | null;
  profileUserId: string | null; // user whose profile popout is open
  membersOpen: boolean; // phones: member list as a slide-in drawer (static on lg+)
  immersive: boolean; // desktop: hide rail+channels while in a voice stage call
  thread: { id: string; title: string } | null; // open thread side panel
  setGuild: (id: string | null) => void;
  setChannel: (id: string | null) => void;
  openDM: (channelId: string) => void; // home view, a DM conversation
  openFriends: () => void; // home view, friends list
  openModal: (m: ModalKind) => void;
  closeModal: () => void;
  openProfile: (userId: string) => void;
  closeProfile: () => void;
  toggleMembers: () => void;
  closeMembers: () => void;
  setImmersive: (v: boolean) => void;
  openThread: (t: { id: string; title: string }) => void;
  closeThread: () => void;
}

export const useUI = create<UIState>((set) => ({
  currentGuildId: null,
  currentChannelId: null,
  modal: null,
  profileUserId: null,
  membersOpen: false,
  immersive: false,
  thread: null,
  setGuild: (id) => set({ currentGuildId: id, currentChannelId: null, membersOpen: false, thread: null }),
  setChannel: (id) => set({ currentChannelId: id, membersOpen: false, thread: null }),
  openDM: (channelId) => set({ currentGuildId: null, currentChannelId: channelId, membersOpen: false, thread: null }),
  openFriends: () => set({ currentGuildId: null, currentChannelId: null, membersOpen: false, thread: null }),
  openModal: (m) => set({ modal: m }),
  closeModal: () => set({ modal: null }),
  openProfile: (userId) => set({ profileUserId: userId }),
  closeProfile: () => set({ profileUserId: null }),
  toggleMembers: () => set((s) => ({ membersOpen: !s.membersOpen })),
  closeMembers: () => set({ membersOpen: false }),
  setImmersive: (v) => set({ immersive: v }),
  openThread: (t) => set({ thread: t }),
  closeThread: () => set({ thread: null }),
}));
