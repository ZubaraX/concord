import { create } from "zustand";
import { persist } from "zustand/middleware";

// Per-user playback volume + local mute in calls. Purely local — changing it
// only affects what *you* hear, never the other participants.
interface VoiceVolumesState {
  volumes: Record<string, number>; // userId -> percent (0–200)
  muted: Record<string, boolean>; // userId -> silenced for me only
  setVolume: (userId: string, percent: number) => void;
  toggleMuted: (userId: string) => void;
  isMuted: (userId: string) => boolean;
}

// Volume key for a user's screen-share audio (separate from their voice).
export const screenVolKey = (userId: string) => `${userId}::screen`;

export const useVoiceVolumes = create<VoiceVolumesState>()(
  persist(
    (set, get) => ({
      volumes: {},
      muted: {},
      setVolume: (userId, percent) =>
        set((s) => ({ volumes: { ...s.volumes, [userId]: percent } })),
      toggleMuted: (userId) =>
        set((s) => {
          const next = { ...s.muted };
          if (next[userId]) delete next[userId];
          else next[userId] = true;
          return { muted: next };
        }),
      isMuted: (userId) => !!get().muted[userId],
    }),
    { name: "concord.voiceVolumes" }
  )
);
