// Voice + screen-share + camera over WebRTC (P2P mesh) with Socket.io
// signaling and the "perfect negotiation" pattern. ICE/TURN comes from the
// server's /api/ice (self-hosted coturn), so calls are low-latency and the
// media never touches the server unless a relay (TURN) is actually required.
//
// Each peer sends up to three streams — mic (audio), screen (video), camera
// (video). Since screen and camera are both video, we tell peers which
// MediaStream id is which "kind" via a `voice:streamkinds` signaling message,
// and classify incoming tracks by their stream id (msid).
import { getSocket } from "./socket";
import { api } from "../api/client";
import { useVoice, type RemoteEntry } from "../store/voice";
import { useSettings } from "../store/settings";
import { RES_MAP } from "../store/settings";

type Kind = "audio" | "screen" | "camera";

const st = () => useVoice.getState();
const cfg = () => useSettings.getState();

const DEFAULT_ICE: RTCConfiguration = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }],
};
let iceConfig: RTCConfiguration = DEFAULT_ICE;
async function loadIceConfig() {
  try {
    const r = await api<{ iceServers: RTCIceServer[] }>("/api/ice");
    if (r?.iceServers?.length) iceConfig = { iceServers: r.iceServers };
  } catch {
    /* keep defaults */
  }
}

interface Peer {
  pc: RTCPeerConnection;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  userId: string;
  pendingCandidates: RTCIceCandidateInit[]; // queued until remoteDescription is set
}
const peers = new Map<string, Peer>();

// Local outgoing streams (stable MediaStream objects → stable msid).
const micStream = new MediaStream();
let micRawTrack: MediaStreamTrack | null = null;
let screenStream: MediaStream | null = null;
let cameraStream: MediaStream | null = null;

// Remote classification: streamId -> kind (learned from voice:streamkinds).
const kindByStream = new Map<string, Kind>();
const pendingTracks: { socketId: string; userId: string; stream: MediaStream; track: MediaStreamTrack }[] = [];

let pttDown = false;
let inited = false;
let aloneTimer: ReturnType<typeof setTimeout> | null = null;

// ── store helpers ────────────────────────────────────────────────────────────
function patchRemote(socketId: string, userId: string, patch: Partial<RemoteEntry>) {
  const prev = st().remotes.find((r) => r.socketId === socketId) ?? { socketId, userId };
  st().set({ remotes: [...st().remotes.filter((r) => r.socketId !== socketId), { ...prev, ...patch, socketId, userId }] });
}
function dropRemote(socketId: string) {
  st().set({ remotes: st().remotes.filter((r) => r.socketId !== socketId) });
}
function signal(to: string, data: Record<string, unknown>) {
  getSocket()?.emit("voice:signal", { to, ...data });
}

function myStreamKinds(): Record<string, Kind> {
  const m: Record<string, Kind> = {};
  if (micRawTrack) m[micStream.id] = "audio";
  if (screenStream) m[screenStream.id] = "screen";
  if (cameraStream) m[cameraStream.id] = "camera";
  return m;
}
function broadcastStreamKinds(to?: string) {
  const channelId = st().channelId;
  if (channelId) getSocket()?.emit("voice:streamkinds", { channelId, to, streams: myStreamKinds() });
}

function updateConnState() {
  if (!st().channelId) return;
  const states = [...peers.values()].map((p) => p.pc.connectionState);
  let next: "idle" | "connecting" | "connected" | "failed";
  if (states.length === 0) next = "connected";
  else if (states.some((s) => s === "connected")) next = "connected";
  else if (states.every((s) => s === "failed")) next = "failed";
  else next = "connecting";
  if (st().connState !== next) st().set({ connState: next });
}

// ── mic ──────────────────────────────────────────────────────────────────────
async function buildMic() {
  const s = cfg();
  const raw = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: s.inputDeviceId ? { exact: s.inputDeviceId } : undefined,
      echoCancellation: s.echoCancellation,
      noiseSuppression: s.noiseSuppression,
      autoGainControl: s.autoGainControl,
    },
  });
  micRawTrack = raw.getAudioTracks()[0];
  micStream.addTrack(micRawTrack);
  applyMicState();
}
function applyMicState() {
  if (!micRawTrack) return;
  const ptt = cfg().voiceMode === "ptt";
  micRawTrack.enabled = !st().muted && (!ptt || pttDown);
}
export function setInputVolume(percent: number) {
  cfg().set({ inputVolume: percent }); // (gain only applies in the mic-test monitor)
}
export async function refreshMic() {
  if (!st().channelId || !micRawTrack) return;
  const old = micRawTrack;
  const s = cfg();
  const raw = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: s.inputDeviceId ? { exact: s.inputDeviceId } : undefined,
      echoCancellation: s.echoCancellation,
      noiseSuppression: s.noiseSuppression,
      autoGainControl: s.autoGainControl,
    },
  });
  const next = raw.getAudioTracks()[0];
  micStream.removeTrack(old);
  micStream.addTrack(next);
  micRawTrack = next;
  peers.forEach((p) => {
    const sender = p.pc.getSenders().find((se) => se.track?.kind === "audio");
    sender?.replaceTrack(next);
  });
  old.stop();
  applyMicState();
}

// ── peer (perfect negotiation) ────────────────────────────────────────────────
function addStreamToPeer(pc: RTCPeerConnection, stream: MediaStream) {
  stream.getTracks().forEach((t) => pc.addTrack(t, stream));
}

function createPeer(socketId: string, userId: string): Peer {
  const existing = peers.get(socketId);
  if (existing) return existing;
  const myId = getSocket()?.id ?? "";
  const pc = new RTCPeerConnection(iceConfig);
  const peer: Peer = { pc, polite: myId < socketId, makingOffer: false, ignoreOffer: false, userId, pendingCandidates: [] };
  peers.set(socketId, peer);

  addStreamToPeer(pc, micStream);
  if (screenStream) addStreamToPeer(pc, screenStream);
  if (cameraStream) addStreamToPeer(pc, cameraStream);

  pc.ontrack = (e) => {
    const stream = e.streams[0];
    if (!stream) return;
    const attach = () => {
      const kind = kindByStream.get(stream.id);
      if (!kind) return false;
      patchRemote(socketId, userId, { [kind]: stream });
      const clear = () => patchRemote(socketId, userId, { [kind]: undefined });
      e.track.addEventListener("mute", clear);
      e.track.addEventListener("ended", clear);
      e.track.addEventListener("unmute", () => patchRemote(socketId, userId, { [kind]: stream }));
      return true;
    };
    if (!attach()) pendingTracks.push({ socketId, userId, stream, track: e.track });
  };
  pc.onicecandidate = (e) => {
    if (e.candidate) signal(socketId, { candidate: e.candidate });
  };
  pc.onnegotiationneeded = async () => {
    try {
      peer.makingOffer = true;
      await pc.setLocalDescription();
      signal(socketId, { description: pc.localDescription });
    } catch (err) {
      console.error("[voice] negotiation", err);
    } finally {
      peer.makingOffer = false;
    }
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed") pc.restartIce();
    updateConnState();
  };
  pc.oniceconnectionstatechange = updateConnState;

  // Tell the new peer which of our streams is which kind.
  broadcastStreamKinds(socketId);
  return peer;
}

async function onSignal(p: { from: string; fromUserId: string; description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }) {
  const peer = createPeer(p.from, p.fromUserId);
  const pc = peer.pc;
  try {
    if (p.description) {
      const collision = p.description.type === "offer" && (peer.makingOffer || pc.signalingState !== "stable");
      peer.ignoreOffer = !peer.polite && collision;
      if (peer.ignoreOffer) return;
      await pc.setRemoteDescription(p.description);
      // Now that the remote description is set, flush any queued candidates.
      for (const c of peer.pendingCandidates.splice(0)) {
        await pc.addIceCandidate(c).catch((err) => console.error("[voice] flush candidate", err));
      }
      if (p.description.type === "offer") {
        await pc.setLocalDescription();
        signal(p.from, { description: pc.localDescription });
      }
    } else if (p.candidate) {
      // Queue candidates that arrive before the remote description is set,
      // otherwise addIceCandidate throws and ICE never completes (stuck on
      // "Connecting…").
      if (!pc.remoteDescription) {
        peer.pendingCandidates.push(p.candidate);
        return;
      }
      try {
        await pc.addIceCandidate(p.candidate);
      } catch (err) {
        if (!peer.ignoreOffer) console.error("[voice] addIceCandidate", err);
      }
    }
  } catch (err) {
    console.error("[voice] signal", err);
  }
}

function onStreamKinds(p: { from: string; userId: string; streams: Record<string, Kind> }) {
  for (const [streamId, kind] of Object.entries(p.streams ?? {})) kindByStream.set(streamId, kind);
  // Resolve any tracks that arrived before we knew their kind.
  for (let i = pendingTracks.length - 1; i >= 0; i--) {
    const t = pendingTracks[i];
    const kind = kindByStream.get(t.stream.id);
    if (kind) {
      patchRemote(t.socketId, t.userId, { [kind]: t.stream });
      const clear = () => patchRemote(t.socketId, t.userId, { [kind]: undefined });
      t.track.addEventListener("mute", clear);
      t.track.addEventListener("ended", clear);
      pendingTracks.splice(i, 1);
    }
  }
}

// ── alone timer / emoji ───────────────────────────────────────────────────────
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

// ── socket wiring ──────────────────────────────────────────────────────────────
export function initVoice() {
  if (inited) return;
  const socket = getSocket();
  if (!socket) return;
  inited = true;
  loadIceConfig();

  socket.on("voice:peerJoined", ({ socketId, userId }: { socketId: string; userId: string }) => {
    if (st().channelId) createPeer(socketId, userId);
  });
  socket.on("voice:peerLeft", ({ socketId }: { socketId: string }) => {
    peers.get(socketId)?.pc.close();
    peers.delete(socketId);
    dropRemote(socketId);
    updateConnState();
  });
  socket.on("voice:signal", onSignal);
  socket.on("voice:streamkinds", onStreamKinds);
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

  const onKey = (down: boolean) => (e: KeyboardEvent) => {
    if (cfg().voiceMode !== "ptt" || !st().channelId) return;
    if (e.code !== cfg().pttKey || e.repeat) return;
    pttDown = down;
    applyMicState();
  };
  window.addEventListener("keydown", onKey(true));
  window.addEventListener("keyup", onKey(false));
}

// ── join / leave ────────────────────────────────────────────────────────────────
export async function joinVoice(channelId: string) {
  if (st().channelId === channelId) return;
  await leaveVoice();
  st().set({ connecting: true });
  await loadIceConfig();
  try {
    await buildMic();
  } catch {
    st().set({ connecting: false });
    alert("Microphone access was denied.");
    return;
  }
  st().set({ channelId, connecting: false, muted: false, connState: "connecting" });
  getSocket()?.emit(
    "voice:join",
    { channelId },
    (res: { ok: boolean; peers?: { socketId: string; userId: string }[] }) => {
      if (res?.ok) res.peers?.forEach((p) => createPeer(p.socketId, p.userId));
    }
  );
}

export async function leaveVoice() {
  clearAloneTimer();
  const channelId = st().channelId;
  if (channelId) getSocket()?.emit("voice:leave", { channelId });
  peers.forEach((p) => p.pc.close());
  peers.clear();
  pendingTracks.length = 0;
  micStream.getTracks().forEach((t) => { t.stop(); micStream.removeTrack(t); });
  micRawTrack = null;
  screenStream?.getTracks().forEach((t) => t.stop());
  cameraStream?.getTracks().forEach((t) => t.stop());
  screenStream = null;
  cameraStream = null;
  st().set({ channelId: null, remotes: [], screenOn: false, cameraOn: false, muted: false, localScreen: null, localCamera: null, effects: [], connState: "idle" });
}

export function toggleMute() {
  st().set({ muted: !st().muted });
  applyMicState();
}

// ── screen / camera ──────────────────────────────────────────────────────────────
function removeStreamFromPeers(stream: MediaStream) {
  peers.forEach((p) => {
    const tracks = new Set(stream.getTracks());
    p.pc.getSenders().forEach((sender) => {
      if (sender.track && tracks.has(sender.track)) {
        try { p.pc.removeTrack(sender); } catch { /* ignore */ }
      }
    });
  });
}

export async function toggleScreen() {
  if (st().screenOn) {
    if (screenStream) removeStreamFromPeers(screenStream);
    screenStream?.getTracks().forEach((t) => t.stop());
    screenStream = null;
    st().set({ screenOn: false, localScreen: null });
    broadcastStreamKinds();
    return;
  }
  const s = cfg();
  const video: MediaTrackConstraints =
    s.screenResolution === "source"
      ? { frameRate: { ideal: s.screenFps } }
      : { ...RES_MAP[s.screenResolution], frameRate: { ideal: s.screenFps } };
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video, audio: false });
  } catch {
    return;
  }
  const vt = screenStream.getVideoTracks()[0];
  if (vt) {
    try { (vt as MediaStreamTrack & { contentHint: string }).contentHint = "detail"; } catch { /* ignore */ }
    vt.addEventListener("ended", () => { if (st().screenOn) toggleScreen(); });
  }
  st().set({ screenOn: true, localScreen: screenStream });
  broadcastStreamKinds(); // announce kind BEFORE tracks arrive at peers
  peers.forEach((p) => addStreamToPeer(p.pc, screenStream!));
  // Raise the screen-share bitrate cap so fullscreen stays sharp.
  setTimeout(() => peers.forEach((p) => tuneVideoSender(p.pc, vt, screenBitrate())), 300);
}

export async function toggleCamera() {
  if (st().cameraOn) {
    if (cameraStream) removeStreamFromPeers(cameraStream);
    cameraStream?.getTracks().forEach((t) => t.stop());
    cameraStream = null;
    st().set({ cameraOn: false, localCamera: null });
    broadcastStreamKinds();
    return;
  }
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      audio: false,
    });
  } catch {
    return;
  }
  cameraStream.getVideoTracks()[0]?.addEventListener("ended", () => { if (st().cameraOn) toggleCamera(); });
  st().set({ cameraOn: true, localCamera: cameraStream });
  broadcastStreamKinds();
  peers.forEach((p) => addStreamToPeer(p.pc, cameraStream!));
}

function screenBitrate(): number {
  switch (cfg().screenResolution) {
    case "720p": return 4_000_000;
    case "1080p": return 8_000_000;
    case "1440p": return 16_000_000;
    case "4k": return 32_000_000;
    default: return 20_000_000;
  }
}
async function tuneVideoSender(pc: RTCPeerConnection, track: MediaStreamTrack | undefined, maxBitrate: number) {
  if (!track) return;
  const sender = pc.getSenders().find((s) => s.track === track);
  if (!sender) return;
  try {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
    params.encodings[0].maxBitrate = maxBitrate;
    params.degradationPreference = "maintain-resolution";
    await sender.setParameters(params);
  } catch { /* best effort */ }
}

// ── mic test (Settings) — monitor + level meter ──────────────────────────────────
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
  gain.connect(ctx.destination);
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
