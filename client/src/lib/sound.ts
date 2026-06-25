// In-app UI / notification sounds, synthesized with the Web Audio API so there
// are no binary assets to ship or license. Plus desktop notifications (works in
// Electron and browsers that grant permission). All sounds respect the user's
// settings (on/off + volume).
import { useSettings } from "../store/settings";

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

// Master gain from settings (0 when sounds are disabled). 0.25 headroom so the
// summed tones never clip.
function masterGain(): number {
  const s = useSettings.getState();
  if (!s.soundsEnabled) return 0;
  return (s.soundVolume / 100) * 0.25;
}

type Note = { f: number; t: number; d: number; type?: OscillatorType; g?: number };

// A short attack/decay envelope keeps tones from clicking.
function playNote(ac: AudioContext, master: number, n: Note, base: number) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = n.type ?? "sine";
  osc.frequency.value = n.f;
  const start = base + n.t;
  const peak = Math.max(master * (n.g ?? 1), 0.0002);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + n.d);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(start);
  osc.stop(start + n.d + 0.03);
}

function play(notes: Note[], master = masterGain()) {
  if (master <= 0) return;
  const ac = audio();
  if (!ac) return;
  const base = ac.currentTime + 0.01;
  for (const n of notes) playNote(ac, master, n, base);
}

export type SoundName =
  | "voiceJoin" // you joined a voice channel
  | "voiceLeave" // you left a voice channel
  | "peerJoin" // someone else joined your channel
  | "peerLeave" // someone else left your channel
  | "mute" // mic muted / deafened
  | "unmute" // mic unmuted / undeafened
  | "message"; // incoming message ping (DM/mention)

const SOUNDS: Record<SoundName, Note[]> = {
  voiceJoin: [
    { f: 523.25, t: 0, d: 0.13 }, // C5
    { f: 783.99, t: 0.1, d: 0.18 }, // G5
  ],
  voiceLeave: [
    { f: 659.25, t: 0, d: 0.13 }, // E5
    { f: 440.0, t: 0.1, d: 0.2 }, // A4
  ],
  peerJoin: [{ f: 880.0, t: 0, d: 0.14, g: 0.6 }], // A5, gentle
  peerLeave: [{ f: 587.33, t: 0, d: 0.16, g: 0.6 }], // D5, gentle
  mute: [{ f: 277.18, t: 0, d: 0.09, type: "triangle", g: 0.8 }], // blip down
  unmute: [{ f: 440.0, t: 0, d: 0.09, type: "triangle", g: 0.8 }], // blip up
  message: [
    { f: 987.77, t: 0, d: 0.1, g: 0.7 }, // B5
    { f: 1318.51, t: 0.08, d: 0.12, g: 0.7 }, // E6
  ],
};

export function playSound(name: SoundName) {
  play(SOUNDS[name]);
}

/** Preview a sound at a chosen volume regardless of the saved volume (Settings). */
export function previewSound(name: SoundName, volumePercent: number) {
  const s = useSettings.getState();
  if (!s.soundsEnabled) return;
  play(SOUNDS[name], (volumePercent / 100) * 0.25);
}

export function playPing() {
  playSound("message");
}

// Incoming-call ring (ignores the volume slider's low end so it's always
// audible, but still silenced when sounds are turned off).
export function playRing() {
  const s = useSettings.getState();
  if (!s.soundsEnabled) return;
  play(
    [
      { f: 660, t: 0, d: 0.2 },
      { f: 880, t: 0.22, d: 0.22 },
    ],
    Math.max((s.soundVolume / 100) * 0.25, 0.12)
  );
}

// Looping ring for incoming calls. Returns a stop function.
export function startRing(): () => void {
  playRing();
  const iv = setInterval(playRing, 2500);
  return () => clearInterval(iv);
}

export function desktopNotify(title: string, body?: string) {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") {
      new Notification(title, { body });
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then((p) => {
        if (p === "granted") new Notification(title, { body });
      });
    }
  } catch {
    /* ignore */
  }
}

/** Ask for desktop-notification permission up front (call after login). */
export function requestNotifyPermission() {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
  } catch {
    /* ignore */
  }
}
