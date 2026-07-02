// Content shared into Concord via the Android "Share" sheet, waiting for the
// user to pick a chat (a banner above the composer offers to attach/send it).
import { create } from "zustand";
import type { SharedContent } from "../lib/push";

interface ShareStore {
  pending: SharedContent | null;
  set: (s: SharedContent | null) => void;
}

export const useShare = create<ShareStore>((set) => ({
  pending: null,
  set: (pending) => set({ pending }),
}));
