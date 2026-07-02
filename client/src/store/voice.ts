import { create } from "zustand";

export interface RemoteEntry {
  socketId: string;
  userId: string;
  audio?: MediaStream; // mic
  screen?: MediaStream; // screen share (present only while sharing)
  camera?: MediaStream; // webcam (present only while camera on)
}

interface VoiceStore {
  channelId: string | null; // the voice channel we're connected to
  connecting: boolean;
  muted: boolean;
  deafened: boolean; // silence ALL incoming audio (also forces mic off)
  pttActive: boolean; // push-to-talk key currently held
  netStats: { rtt: number; loss: number } | null; // worst peer RTT (ms) + loss %
  joinedAt: number | null; // when we joined the call (for the duration timer)
  stageOpen: boolean; // the big voice-stage view is visible (hides floating tiles)
  speakerOn: boolean; // Android: loudspeaker (true) vs earpiece (false)
  screenOn: boolean;
  cameraOn: boolean;
  localScreen: MediaStream | null; // preview of our own shared screen
  localCamera: MediaStream | null; // preview of our own webcam
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
  deafened: false,
  pttActive: false,
  netStats: null,
  joinedAt: null,
  stageOpen: false,
  speakerOn: true,
  screenOn: false,
  cameraOn: false,
  localScreen: null,
  localCamera: null,
  occupancy: {},
  remotes: [],
  effects: [],
  connState: "idle",
  set: (p) => set(p),
}));
