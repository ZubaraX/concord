// Voice + screen-share via a SERVER RELAY over the existing Socket.io
// connection (no WebRTC / no TURN). Each client captures media and streams
// chunks to the server, which forwards them to everyone else in the voice
// room. This works anywhere the server is reachable (including Codespaces),
// because there is no peer-to-peer connection to negotiate.
//
//   • Audio: Web Audio capture → Int16 PCM frames → scheduled playback
//            (low latency, no codec/MSE fuss).
//   • Screen: MediaRecorder (VP8) chunks → MediaSource playback → captureStream
//            so the existing <video> tiles render it unchanged.
import { getSocket } from "./socket";
import { useVoice, type RemoteEntry } from "../store/voice";
import { useSettings, RES_MAP } from "../store/settings";

const st = () => useVoice.getState();
const cfg = () => useSettings.getState();

// ── Local capture ──────────────────────────────────────────────────────────
let micStream: MediaStream | null = null;
let captureCtx: AudioContext | null = null;
let captureGain: GainNode | null = null;
let captureNode: ScriptProcessorNode | null = null;
let silentSink: GainNode | null = null;

// Outgoing video senders (screen + webcam), each its own capture + recorder.
interface VideoSender {
  stream: MediaStream | null;
  recorder: MediaRecorder | null;
  first: boolean;
}
const senders: Record<"screen" | "camera", VideoSender> = {
  screen: { stream: null, recorder: null, first: true },
  camera: { stream: null, recorder: null, first: true },
};

let micEnabled = true; // gates sending (mute / push-to-talk)
let pttDown = false;

// Noise gate (extra suppression on top of the browser's noiseSuppression):
// while the input is below the threshold we stop transmitting, so steady
// background noise / silence isn't sent. Hangover keeps it open briefly after
// speech so word endings aren't clipped.
let gateHangover = 0;
const GATE_HANGOVER_FRAMES = 10; // ~0.4s at 2048-sample frames
// Sensitivity (0–100) → RMS threshold. Higher sensitivity = lower threshold
// (transmits quieter sounds); 100 = gate effectively off.
const gateThreshold = () => (1 - cfg().micSensitivity / 100) * 0.05;
let inited = false;
let aloneTimer: ReturnType<typeof setTimeout> | null = null;
let restartTimer: ReturnType<typeof setTimeout> | null = null;

// ── Playback (per remote sender socketId) ───────────────────────────────────
interface AudioPlayer {
  ctx: AudioContext;
  gain: GainNode;
  nextTime: number;
}
type VideoKind = "screen" | "camera";
interface VideoPlayer {
  ms: MediaSource;
  sb: SourceBuffer | null;
  queue: ArrayBuffer[];
  el: HTMLVideoElement;
  url: string;
  userId: string;
  kind: VideoKind;
}
const audioPlayers = new Map<string, AudioPlayer>();
const videoPlayers = new Map<string, VideoPlayer>(); // key: `${from}|${kind}`
const vpKey = (from: string, kind: VideoKind) => `${from}|${kind}`;

// ── Remote tiles (so VoiceOverlay renders screen video unchanged) ────────────
function patchRemote(socketId: string, userId: string, patch: Partial<RemoteEntry>) {
  const prev = st().remotes.find((r) => r.socketId === socketId) ?? { socketId, userId };
  const next = { ...prev, ...patch, socketId, userId };
  st().set({ remotes: [...st().remotes.filter((r) => r.socketId !== socketId), next] });
}
function dropRemote(socketId: string) {
  st().set({ remotes: st().remotes.filter((r) => r.socketId !== socketId) });
}

function emitChunk(kind: "audio" | VideoKind, data: ArrayBuffer, extra: { sampleRate?: number; first?: boolean } = {}) {
  const channelId = st().channelId;
  if (channelId) getSocket()?.emit("media:chunk", { channelId, kind, data, ...extra });
}

// ── Mic capture (Int16 PCM frames) ───────────────────────────────────────────
async function startMicCapture() {
  const s = cfg();
  micStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: s.inputDeviceId ? { exact: s.inputDeviceId } : undefined,
      echoCancellation: s.echoCancellation,
      noiseSuppression: s.noiseSuppression,
      autoGainControl: s.autoGainControl,
    },
  });
  captureCtx = new AudioContext();
  await captureCtx.resume();
  const source = captureCtx.createMediaStreamSource(micStream);
  captureGain = captureCtx.createGain();
  captureGain.gain.value = s.inputVolume / 100;
  captureNode = captureCtx.createScriptProcessor(2048, 1, 1);
  silentSink = captureCtx.createGain();
  silentSink.gain.value = 0; // run the processor without echoing locally

  source.connect(captureGain);
  captureGain.connect(captureNode);
  captureNode.connect(silentSink);
  silentSink.connect(captureCtx.destination);

  captureNode.onaudioprocess = (e) => {
    if (!micEnabled) return;
    const f32 = e.inputBuffer.getChannelData(0);

    // Noise gate: don't transmit while it's just background noise.
    if (cfg().noiseSuppression) {
      let sum = 0;
      for (let i = 0; i < f32.length; i++) sum += f32[i] * f32[i];
      const rms = Math.sqrt(sum / f32.length);
      if (rms >= gateThreshold()) gateHangover = GATE_HANGOVER_FRAMES;
      else if (gateHangover > 0) gateHangover--;
      if (gateHangover === 0) return; // gated → silence
    }

    const i16 = new Int16Array(f32.length);
    for (let i = 0; i < f32.length; i++) {
      const v = Math.max(-1, Math.min(1, f32[i]));
      i16[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }
    emitChunk("audio", i16.buffer, { sampleRate: captureCtx!.sampleRate });
  };
}

function stopMicCapture() {
  try {
    captureNode?.disconnect();
    captureGain?.disconnect();
    silentSink?.disconnect();
  } catch {
    /* ignore */
  }
  micStream?.getTracks().forEach((t) => t.stop());
  captureCtx?.close().catch(() => {});
  captureNode = null;
  captureGain = null;
  silentSink = null;
  captureCtx = null;
  micStream = null;
}

function applyMicState() {
  const ptt = cfg().voiceMode === "ptt";
  micEnabled = !st().muted && (!ptt || pttDown);
}

export function setInputVolume(percent: number) {
  cfg().set({ inputVolume: percent });
  if (captureGain) captureGain.gain.value = percent / 100;
}

export async function refreshMic() {
  if (!st().channelId) return;
  stopMicCapture();
  await startMicCapture();
  applyMicState();
}

// ── Audio playback ───────────────────────────────────────────────────────────
function playAudio(from: string, sampleRate: number, data: ArrayBuffer) {
  let p = audioPlayers.get(from);
  if (!p) {
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    p = { ctx, gain, nextTime: 0 };
    audioPlayers.set(from, p);
  }
  p.gain.gain.value = Math.min(cfg().outputVolume / 100, 2);

  const i16 = new Int16Array(data);
  const f32 = new Float32Array(i16.length);
  for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 0x8000;

  const buf = p.ctx.createBuffer(1, f32.length, sampleRate || 48000);
  buf.copyToChannel(f32, 0);
  const src = p.ctx.createBufferSource();
  src.buffer = buf;
  src.connect(p.gain);
  // ~150ms jitter buffer to absorb network variance (less choppy). If we've
  // fallen behind (stall), resync to a fresh buffer instead of playing late.
  const JITTER = 0.15;
  if (p.nextTime < p.ctx.currentTime) p.nextTime = p.ctx.currentTime + JITTER;
  const startAt = Math.max(p.ctx.currentTime + JITTER, p.nextTime);
  src.start(startAt);
  p.nextTime = startAt + buf.duration;
}

function stopAudioPlayer(from: string) {
  const p = audioPlayers.get(from);
  if (p) {
    p.ctx.close().catch(() => {});
    audioPlayers.delete(from);
  }
}

// ── Screen playback (MediaSource) ────────────────────────────────────────────
function appendVideo(vp: VideoPlayer) {
  if (!vp.sb || vp.sb.updating || vp.queue.length === 0) return;
  try {
    vp.sb.appendBuffer(vp.queue.shift()!);
  } catch {
    /* sequence/quota hiccup — drop a chunk */
    vp.queue.shift();
  }
}

function playVideo(from: string, userId: string, kind: VideoKind, first: boolean, data: ArrayBuffer) {
  const key = vpKey(from, kind);
  let vp = videoPlayers.get(key);
  // A fresh "first" chunk means a new recorder session → rebuild the player.
  if (first && vp) {
    stopVideoPlayer(from, kind);
    vp = undefined;
  }
  if (!vp) {
    if (!first) return; // wait for an init segment before starting
    const ms = new MediaSource();
    const el = document.createElement("video");
    el.muted = true;
    el.autoplay = true;
    (el as HTMLVideoElement & { playsInline: boolean }).playsInline = true;
    el.src = URL.createObjectURL(ms);
    const player: VideoPlayer = { ms, sb: null, queue: [], el, url: el.src, userId, kind };
    videoPlayers.set(key, player);
    ms.addEventListener("sourceopen", () => {
      try {
        player.sb = ms.addSourceBuffer('video/webm;codecs="vp8"');
        player.sb.mode = "sequence";
        player.sb.addEventListener("updateend", () => appendVideo(player));
        appendVideo(player);
      } catch {
        /* unsupported */
      }
    });
    el.play().catch(() => {});
    try {
      const stream = (el as HTMLVideoElement & { captureStream: () => MediaStream }).captureStream();
      patchRemote(from, userId, kind === "camera" ? { camera: stream } : { video: stream });
    } catch {
      /* captureStream unsupported */
    }
    vp = player;
  }
  vp.queue.push(data);
  appendVideo(vp);
}

function stopVideoPlayer(from: string, kind: VideoKind) {
  const key = vpKey(from, kind);
  const vp = videoPlayers.get(key);
  if (!vp) return;
  try {
    vp.el.pause();
    URL.revokeObjectURL(vp.url);
  } catch {
    /* ignore */
  }
  videoPlayers.delete(key);
  patchRemote(from, vp.userId, kind === "camera" ? { camera: undefined } : { video: undefined });
}

function stopAllVideoPlayers(from: string) {
  stopVideoPlayer(from, "screen");
  stopVideoPlayer(from, "camera");
}

// ── Auto-leave when alone ────────────────────────────────────────────────────
function startAloneTimer() {
  if (aloneTimer) return;
  aloneTimer = setTimeout(() => {
    aloneTimer = null;
    const ch = st().channelId;
    if (ch && (st().occupancy[ch] ?? []).length <= 1) leaveVoice();
  }, 60_000);
}
function clearAloneTimer() {
  if (aloneTimer) clearTimeout(aloneTimer);
  aloneTimer = null;
}

export function sendVoiceEmoji(emoji: string) {
  const channelId = st().channelId;
  if (channelId) getSocket()?.emit("voice:emoji", { channelId, emoji });
}

// ── Socket wiring ────────────────────────────────────────────────────────────
export function initVoice() {
  if (inited) return;
  const socket = getSocket();
  if (!socket) return;
  inited = true;

  socket.on("voice:peerLeft", ({ socketId }: { socketId: string }) => {
    stopAudioPlayer(socketId);
    stopAllVideoPlayers(socketId);
    dropRemote(socketId);
  });

  // Someone joined while we're sharing → restart recorders so they get a
  // fresh init segment (PCM audio needs no init, only video does).
  socket.on("voice:peerJoined", () => {
    if (st().screenOn || st().cameraOn) {
      if (restartTimer) clearTimeout(restartTimer);
      restartTimer = setTimeout(() => {
        if (st().screenOn) restartRecorder("screen");
        if (st().cameraOn) restartRecorder("camera");
      }, 400);
    }
  });

  socket.on("voice:state", ({ channelId, userIds }: { channelId: string; userIds: string[] }) => {
    st().set({ occupancy: { ...st().occupancy, [channelId]: userIds } });
    if (channelId === st().channelId) {
      if (userIds.length <= 1) startAloneTimer();
      else clearAloneTimer();
    }
  });

  socket.on("voice:emoji", ({ emoji }: { emoji: string }) => {
    const id = Date.now() + Math.random();
    st().set({ effects: [...st().effects, { id, emoji }] });
    setTimeout(() => st().set({ effects: st().effects.filter((e) => e.id !== id) }), 4500);
  });

  // Incoming media from other participants.
  socket.on(
    "media:chunk",
    (p: { from: string; userId: string; kind: "audio" | VideoKind; sampleRate?: number; first?: boolean; data: ArrayBuffer }) => {
      if (!st().channelId) return;
      const data = p.data instanceof ArrayBuffer ? p.data : (p.data as { buffer?: ArrayBuffer })?.buffer;
      if (!data) return;
      if (p.kind === "audio") playAudio(p.from, p.sampleRate ?? 48000, data);
      else playVideo(p.from, p.userId, p.kind, !!p.first, data);
    }
  );
  socket.on("media:stop", ({ from, kind }: { from: string; kind: "audio" | VideoKind }) => {
    if (kind === "audio") stopAudioPlayer(from);
    else stopVideoPlayer(from, kind);
  });

  const onKey = (down: boolean) => (e: KeyboardEvent) => {
    if (cfg().voiceMode !== "ptt" || !st().channelId) return;
    if (e.code !== cfg().pttKey || e.repeat) return;
    pttDown = down;
    applyMicState();
  };
  window.addEventListener("keydown", onKey(true));
  window.addEventListener("keyup", onKey(false));
}

// ── Join / leave ─────────────────────────────────────────────────────────────
export async function joinVoice(channelId: string) {
  if (st().channelId === channelId) return;
  await leaveVoice();
  st().set({ connecting: true });
  try {
    await startMicCapture();
  } catch {
    st().set({ connecting: false });
    alert("Microphone access was denied.");
    return;
  }
  st().set({ channelId, connecting: false, muted: false, connState: "connected" });
  applyMicState();
  getSocket()?.emit("voice:join", { channelId }, () => {});
}

export async function leaveVoice() {
  clearAloneTimer();
  const channelId = st().channelId;
  if (channelId) {
    getSocket()?.emit("media:stop", { channelId, kind: "audio" });
    if (st().screenOn) getSocket()?.emit("media:stop", { channelId, kind: "screen" });
    if (st().cameraOn) getSocket()?.emit("media:stop", { channelId, kind: "camera" });
    getSocket()?.emit("voice:leave", { channelId });
  }
  stopMicCapture();
  stopSender("screen");
  stopSender("camera");
  audioPlayers.forEach((p) => p.ctx.close().catch(() => {}));
  audioPlayers.clear();
  videoPlayers.forEach((vp) => {
    try { vp.el.pause(); URL.revokeObjectURL(vp.url); } catch { /* ignore */ }
  });
  videoPlayers.clear();
  st().set({ channelId: null, remotes: [], screenOn: false, cameraOn: false, muted: false, localScreen: null, localCamera: null, effects: [], connState: "idle" });
}

export function toggleMute() {
  st().set({ muted: !st().muted });
  applyMicState();
}

// ── Video senders (screen + camera) ──────────────────────────────────────────
function screenBitrate(): number {
  switch (cfg().screenResolution) {
    case "720p": return 4_000_000;
    case "1080p": return 8_000_000;
    case "1440p": return 16_000_000;
    case "4k": return 32_000_000;
    default: return 20_000_000;
  }
}

function startRecorder(kind: "screen" | "camera") {
  const snd = senders[kind];
  if (!snd.stream) return;
  const videoOnly = new MediaStream(snd.stream.getVideoTracks());
  let recorder: MediaRecorder;
  const opts = { mimeType: 'video/webm;codecs="vp8"', videoBitsPerSecond: kind === "screen" ? screenBitrate() : 2_500_000 };
  try {
    recorder = new MediaRecorder(videoOnly, opts);
  } catch {
    recorder = new MediaRecorder(videoOnly);
  }
  snd.first = true;
  recorder.ondataavailable = async (e) => {
    if (!e.data || e.data.size === 0) return;
    const buf = await e.data.arrayBuffer();
    emitChunk(kind, buf, { first: snd.first });
    snd.first = false;
  };
  recorder.start(250);
  snd.recorder = recorder;
}

function restartRecorder(kind: "screen" | "camera") {
  if (!senders[kind].stream) return;
  try {
    senders[kind].recorder?.stop();
  } catch {
    /* ignore */
  }
  startRecorder(kind);
}

function stopSender(kind: "screen" | "camera") {
  const snd = senders[kind];
  try {
    snd.recorder?.stop();
  } catch {
    /* ignore */
  }
  snd.recorder = null;
  snd.stream?.getTracks().forEach((t) => t.stop());
  snd.stream = null;
}

export async function toggleScreen() {
  if (st().screenOn) {
    const channelId = st().channelId;
    stopSender("screen");
    if (channelId) getSocket()?.emit("media:stop", { channelId, kind: "screen" });
    st().set({ screenOn: false, localScreen: null });
    return;
  }
  const s = cfg();
  const video: MediaTrackConstraints =
    s.screenResolution === "source"
      ? { frameRate: { ideal: s.screenFps } }
      : { ...RES_MAP[s.screenResolution], frameRate: { ideal: s.screenFps } };
  let screenStream: MediaStream;
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video, audio: false });
  } catch {
    return;
  }
  const vt = screenStream.getVideoTracks()[0];
  if (vt) {
    try {
      (vt as MediaStreamTrack & { contentHint: string }).contentHint = "detail";
    } catch {
      /* ignore */
    }
    vt.addEventListener("ended", () => {
      if (st().screenOn) toggleScreen();
    });
  }
  senders.screen.stream = screenStream;
  startRecorder("screen");
  st().set({ screenOn: true, localScreen: screenStream });
}

export async function toggleCamera() {
  if (st().cameraOn) {
    const channelId = st().channelId;
    stopSender("camera");
    if (channelId) getSocket()?.emit("media:stop", { channelId, kind: "camera" });
    st().set({ cameraOn: false, localCamera: null });
    return;
  }
  let cam: MediaStream;
  try {
    cam = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      audio: false,
    });
  } catch {
    return;
  }
  const vt = cam.getVideoTracks()[0];
  vt?.addEventListener("ended", () => {
    if (st().cameraOn) toggleCamera();
  });
  senders.camera.stream = cam;
  startRecorder("camera");
  st().set({ cameraOn: true, localCamera: cam });
}

// ── Settings helpers (unchanged API) ─────────────────────────────────────────
export async function startMicTest(onLevel: (level: number) => void): Promise<() => void> {
  const s = cfg();
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: s.inputDeviceId ? { exact: s.inputDeviceId } : undefined,
      echoCancellation: s.echoCancellation,
      noiseSuppression: s.noiseSuppression,
      autoGainControl: s.autoGainControl,
    },
  });
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  const gain = ctx.createGain();
  gain.gain.value = s.inputVolume / 100;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  src.connect(gain);
  gain.connect(analyser);
  gain.connect(ctx.destination); // monitor: hear yourself during the test
  const data = new Uint8Array(analyser.frequencyBinCount);
  let raf = 0;
  const loop = () => {
    analyser.getByteTimeDomainData(data);
    let peak = 0;
    for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128);
    onLevel(peak);
    raf = requestAnimationFrame(loop);
  };
  loop();
  return () => {
    cancelAnimationFrame(raf);
    stream.getTracks().forEach((t) => t.stop());
    ctx.close().catch(() => {});
  };
}

export async function listDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      inputs: devices.filter((d) => d.kind === "audioinput"),
      outputs: devices.filter((d) => d.kind === "audiooutput"),
    };
  } catch {
    return { inputs: [], outputs: [] };
  }
}
