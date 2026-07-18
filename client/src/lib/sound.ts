// In-app UI / notification sounds, synthesized with the Web Audio API so there
// are no binary assets to ship or license. Plus desktop notifications (works in
// Electron and browsers that grant permission). All sounds respect the user's
// settings (on/off + volume).
//
// The synth is deliberately "musical": every note is two slightly-detuned
// oscillators (chorus warmth) plus quiet bell partials, run through a gentle
// low-pass and a soft feedback-delay tail — instead of the old dry beeps.
import { useSettings } from "../store/settings";

let ctx: AudioContext | null = null;
let dryBus: GainNode | null = null;
let echoBus: GainNode | null = null;

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      // Master buses: dry → out; echo send → delay (with feedback + damping) → out.
      dryBus = ctx.createGain();
      dryBus.gain.value = 1;
      dryBus.connect(ctx.destination);

      echoBus = ctx.createGain();
      echoBus.gain.value = 1;
      const delay = ctx.createDelay(1);
      delay.delayTime.value = 0.12;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.24;
      const damp = ctx.createBiquadFilter();
      damp.type = "lowpass";
      damp.frequency.value = 2600;
      echoBus.connect(delay);
      delay.connect(damp);
      damp.connect(feedback);
      feedback.connect(delay); // feedback loop
      damp.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

// Master gain from settings (0 when sounds are disabled). 0.22 headroom so the
// summed tones never clip.
function masterGain(): number {
  const s = useSettings.getState();
  if (!s.soundsEnabled) return 0;
  return (s.soundVolume / 100) * 0.22;
}

type Note = {
  f: number; // fundamental, Hz
  t: number; // start offset, s
  d: number; // duration, s
  type?: OscillatorType;
  g?: number; // relative gain
  glide?: number; // optional target frequency (mute/unmute swoops)
  bell?: boolean; // add quiet inharmonic partials (bell timbre)
};

function scheduleOsc(
  ac: AudioContext,
  out: GainNode,
  freq: number,
  detune: number,
  type: OscillatorType,
  start: number,
  dur: number,
  glide?: number
) {
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (glide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, glide), start + dur * 0.85);
  osc.detune.value = detune;
  osc.connect(out);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

// One note = detuned pair + optional bell partials, private envelope + filter,
// routed to the dry bus and (quietly) to the echo bus.
function playNote(ac: AudioContext, master: number, n: Note, base: number) {
  const start = base + n.t;
  const peak = Math.max(master * (n.g ?? 1), 0.0002);

  const env = ac.createGain();
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(peak, start + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0001, start + n.d);

  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 3200;
  lp.Q.value = 0.6;

  env.connect(lp);
  lp.connect(dryBus!);
  const send = ac.createGain();
  send.gain.value = 0.28; // echo send level
  lp.connect(send);
  send.connect(echoBus!);

  const type = n.type ?? "sine";
  scheduleOsc(ac, env, n.f, -4, type, start, n.d, n.glide);
  scheduleOsc(ac, env, n.f, +4, type, start, n.d, n.glide);
  if (n.bell) {
    // Quiet upper partials make it chime instead of beep.
    const p1 = ac.createGain();
    p1.gain.setValueAtTime(0.0001, start);
    p1.gain.exponentialRampToValueAtTime(peak * 0.3, start + 0.008);
    p1.gain.exponentialRampToValueAtTime(0.0001, start + n.d * 0.6);
    p1.connect(lp);
    scheduleOsc(ac, p1, n.f * 2, 0, "sine", start, n.d * 0.6);
    const p2 = ac.createGain();
    p2.gain.setValueAtTime(0.0001, start);
    p2.gain.exponentialRampToValueAtTime(peak * 0.16, start + 0.006);
    p2.gain.exponentialRampToValueAtTime(0.0001, start + n.d * 0.4);
    p2.connect(lp);
    scheduleOsc(ac, p2, n.f * 2.76, 0, "sine", start, n.d * 0.4);
  }
}

function play(notes: Note[], master = masterGain()) {
  if (master <= 0) return;
  const ac = audio();
  if (!ac) return;
  const base = ac.currentTime + 0.02;
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
    { f: 523.25, t: 0, d: 0.16, bell: true, g: 0.8 }, // C5
    { f: 659.25, t: 0.09, d: 0.16, bell: true, g: 0.85 }, // E5
    { f: 783.99, t: 0.18, d: 0.32, bell: true }, // G5
  ],
  voiceLeave: [
    { f: 783.99, t: 0, d: 0.14, g: 0.7 }, // G5
    { f: 659.25, t: 0.09, d: 0.14, g: 0.7 }, // E5
    { f: 523.25, t: 0.18, d: 0.28, g: 0.8 }, // C5
  ],
  peerJoin: [{ f: 659.25, t: 0, d: 0.22, bell: true, g: 0.55 }], // E5 chime
  peerLeave: [{ f: 523.25, t: 0, d: 0.24, g: 0.5 }], // C5, gentle
  mute: [{ f: 420, t: 0, d: 0.13, type: "triangle", g: 0.7, glide: 262 }], // swoop down
  unmute: [{ f: 290, t: 0, d: 0.13, type: "triangle", g: 0.7, glide: 470 }], // swoop up
  message: [
    { f: 783.99, t: 0, d: 0.18, bell: true, g: 0.75 }, // G5
    { f: 1046.5, t: 0.11, d: 0.3, bell: true, g: 0.85 }, // C6 — friendly "ding-dong"
  ],
};

export function playSound(name: SoundName) {
  play(SOUNDS[name]);
}

/** Preview a sound at a chosen volume regardless of the saved volume (Settings). */
export function previewSound(name: SoundName, volumePercent: number) {
  const s = useSettings.getState();
  if (!s.soundsEnabled) return;
  play(SOUNDS[name], (volumePercent / 100) * 0.22);
}

export function playPing() {
  playSound("message");
}

// One cycle of the incoming-call melody (kept audible even at a low volume
// slider, but silenced entirely when sounds are off).
export function playRing() {
  const s = useSettings.getState();
  if (!s.soundsEnabled) return;
  const vol = Math.max((s.soundVolume / 100) * 0.22, 0.1);
  play(
    [
      { f: 783.99, t: 0, d: 0.16, bell: true, g: 0.85 }, // G5
      { f: 1046.5, t: 0.18, d: 0.16, bell: true, g: 0.9 }, // C6
      { f: 1318.51, t: 0.36, d: 0.42, bell: true }, // E6 — rising, expectant
      { f: 783.99, t: 1.05, d: 0.14, bell: true, g: 0.6 }, // echo of the motif
      { f: 1046.5, t: 1.21, d: 0.3, bell: true, g: 0.7 },
    ],
    vol
  );
}

// Looping ring for incoming calls. Returns a stop function.
export function startRing(): () => void {
  playRing();
  const iv = setInterval(playRing, 2600);
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
