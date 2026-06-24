import { create } from "zustand";

export interface RemoteEntry {
  socketId: string;
  userId: string;
  audio?: MediaStream; // mic
  video?: MediaStream; // screen share (present only while sharing)
}

interface VoiceStore {
  channelId: string | null; // the voice channel we're connected to
  connecting: boolean;
  muted: boolean;
  screenOn: boolean;
  localScreen: MediaStream | null; // preview of our own shared screen
  occupancy: Record<string, string[]>; // channelId -> userIds (for the sidebar)
  remotes: RemoteEntry[]; // active call peers' streams
  effects: { id: number; emoji: string }[]; // floating emoji reactions in-call
  connState: "idle" | "connecting" | "connected" | "failed"; // WebRTC media link
  set: (p: Partial<VoiceStore>) => void;
}

export const useVoice = create<VoiceStore>((set) => ({
  channelId: null,
  connecting: false,
  muted: false,
  screenOn: false,
  localScreen: null,
  occupancy: {},
  remotes: [],
  effects: [],
  connState: "idle",
  set: (p) => set(p),
}));
