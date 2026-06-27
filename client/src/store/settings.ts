import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ScreenResolution = "720p" | "1080p" | "1440p" | "4k" | "source";
export type ScreenFps = 15 | 30 | 60 | 120 | 144;
export type VoiceMode = "vad" | "ptt";

export interface SettingsState {
  // Audio input
  inputDeviceId: string; // "" = system default
  inputVolume: number; // 0–200 (%)
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  micSensitivity: number; // 0–100; higher = picks up quieter sounds (less gating)
  voiceMode: VoiceMode;
  pttKey: string; // KeyboardEvent.code, e.g. "Space"

  // Audio output
  outputDeviceId: string;
  outputVolume: number; // 0–200 (%)

  // Screen share
  screenResolution: ScreenResolution;
  screenFps: ScreenFps;
  screenAudio: boolean;

  // UI / notification sounds (join/leave/mute/message). Synthesized in-app.
  soundsEnabled: boolean;
  soundVolume: number; // 0–100 (%)

  // Interface language.
  lang: "en" | "ru";

  // In-call overlay (separate always-on-top window showing who's speaking).
  overlayEnabled: boolean;
  overlayCorner: "top-left" | "top-right" | "bottom-left" | "bottom-right";

  set: (p: Partial<SettingsState>) => void;
}

export const RES_MAP: Record<Exclude<ScreenResolution, "source">, { width: number; height: number }> = {
  "720p": { width: 1280, height: 720 },
  "1080p": { width: 1920, height: 1080 },
  "1440p": { width: 2560, height: 1440 },
  "4k": { width: 3840, height: 2160 },
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      inputDeviceId: "",
      inputVolume: 100,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      micSensitivity: 75,
      voiceMode: "vad",
      pttKey: "Space",

      outputDeviceId: "",
      outputVolume: 100,

      screenResolution: "1080p",
      screenFps: 60,
      screenAudio: true,

      soundsEnabled: true,
      soundVolume: 60,

      lang: (typeof navigator !== "undefined" && navigator.language?.startsWith("ru") ? "ru" : "en"),

      overlayEnabled: true,
      overlayCorner: "top-right",

      set: (p) => set(p),
    }),
    { name: "concord.settings" }
  )
);
