import { create } from "zustand";

// Per-viewer, local-only: which users' screen shares this client has chosen to
// hide (so they're neither shown nor heard). Never affects anyone else.
interface ScreenViewState {
  hidden: Record<string, boolean>;
  toggle: (userId: string) => void;
  isHidden: (userId: string) => boolean;
}

export const useScreenView = create<ScreenViewState>((set, get) => ({
  hidden: {},
  toggle: (userId) => set((s) => ({ hidden: { ...s.hidden, [userId]: !s.hidden[userId] } })),
  isHidden: (userId) => !!get().hidden[userId],
}));
