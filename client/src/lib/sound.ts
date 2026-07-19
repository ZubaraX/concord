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

// ── Soundboard: short fun sounds for voice channels, fully synthesized. ─────
export const SOUNDBOARD: { id: string; emoji: string; nameRu: string }[] = [
  { id: "airhorn", emoji: "📯", nameRu: "Горн" },
  { id: "tada", emoji: "🎺", nameRu: "Фанфары" },
  { id: "sadtrombone", emoji: "😢", nameRu: "Тромбон" },
  { id: "badumtss", emoji: "🥁", nameRu: "Ба-дум-тсс" },
  { id: "applause", emoji: "👏", nameRu: "Аплодисменты" },
  { id: "boing", emoji: "🤪", nameRu: "Боинг" },
  { id: "whistle", emoji: "😗", nameRu: "Свист" },
  { id: "bell", emoji: "🔔", nameRu: "Колокол" },
];

// Short white-noise burst through a filter — claps, snares, cymbals.
function noiseBurst(ac: AudioContext, master: number, start: number, dur: number, freq: number, g = 1) {
  const len = Math.ceil(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = freq;
  bp.Q.value = 0.9;
  const env = ac.createGain();
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(Math.max(master * g, 0.0002), start + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(bp);
  bp.connect(env);
  env.connect(dryBus!);
  src.start(start);
  src.stop(start + dur + 0.02);
}

/** Play a soundboard sound locally (already relayed to the room by the caller). */
export function playBoardSound(id: string) {
  const master = Math.max(masterGain(), useSettings.getState().soundsEnabled ? 0.1 : 0);
  if (master <= 0) return;
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + 0.02;
  const note = (n: Note) => playNote(ac, master, n, t);

  switch (id) {
    case "airhorn":
      // Brash detuned sawtooth blast with a pitch dip.
      for (const det of [0, 12, -9]) {
        note({ f: 466 + det, t: 0, d: 0.75, type: "sawtooth", g: 0.5, glide: 440 + det });
      }
      break;
    case "tada":
      note({ f: 523.25, t: 0, d: 0.14, type: "square", g: 0.35 });
      note({ f: 659.25, t: 0.12, d: 0.14, type: "square", g: 0.35 });
      note({ f: 783.99, t: 0.24, d: 0.14, type: "square", g: 0.35 });
      note({ f: 1046.5, t: 0.36, d: 0.5, type: "square", g: 0.4, bell: true });
      break;
    case "sadtrombone":
      note({ f: 233, t: 0, d: 0.32, type: "triangle", g: 0.9, glide: 220 });
      note({ f: 220, t: 0.34, d: 0.32, type: "triangle", g: 0.9, glide: 207 });
      note({ f: 207, t: 0.68, d: 0.32, type: "triangle", g: 0.9, glide: 196 });
      note({ f: 196, t: 1.02, d: 0.8, type: "triangle", g: 1, glide: 155 });
      break;
    case "badumtss":
      note({ f: 110, t: 0, d: 0.12, type: "sine", g: 1.2, glide: 55 }); // ba
      note({ f: 110, t: 0.16, d: 0.12, type: "sine", g: 1.2, glide: 55 }); // dum
      noiseBurst(ac, master, t + 0.32, 0.5, 6000, 0.9); // tss
      break;
    case "applause":
      for (let i = 0; i < 22; i++) {
        noiseBurst(ac, master, t + Math.random() * 1.3, 0.05 + Math.random() * 0.05, 1500 + Math.random() * 2500, 0.5);
      }
      break;
    case "boing":
      note({ f: 320, t: 0, d: 0.5, type: "triangle", g: 1, glide: 90 });
      note({ f: 480, t: 0.02, d: 0.35, type: "sine", g: 0.5, glide: 130 });
      break;
    case "whistle":
      note({ f: 900, t: 0, d: 0.28, type: "sine", g: 0.8, glide: 1800 });
      note({ f: 1800, t: 0.3, d: 0.35, type: "sine", g: 0.8, glide: 700 });
      break;
    case "bell":
      note({ f: 660, t: 0, d: 1.2, bell: true, g: 1 });
      break;
  }
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
