import { create } from "zustand";
import { persist } from "zustand/middleware";

// Per-user playback volume in calls (0–200%). Purely local — changing it only
// affects what *you* hear, never the other participants.
interface VoiceVolumesState {
  volumes: Record<string, number>; // userId -> percent
  setVolume: (userId: string, percent: number) => void;
}

export const useVoiceVolumes = create<VoiceVolumesState>()(
  persist(
    (set) => ({
      volumes: {},
      setVolume: (userId, percent) =>
        set((s) => ({ volumes: { ...s.volumes, [userId]: percent } })),
    }),
    { name: "concord.voiceVolumes" }
  )
);
