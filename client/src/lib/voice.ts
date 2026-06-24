// WebRTC P2P voice + screen-share manager (mesh topology with Socket.io
// signaling, using the "perfect negotiation" pattern so simultaneous offers
// don't deadlock). Good for small voice channels; an SFU (mediasoup) is the
// path to large rooms — the signaling shape here maps cleanly onto that later.
//
// Audio pipeline: raw mic → WebAudio GainNode (input volume) → sent track.
// This lets us adjust input volume live and supports push-to-talk + live
// device switching without renegotiation.
import { getSocket } from "./socket";
import { useVoice } from "../store/voice";
import { useSettings, RES_MAP } from "../store/settings";

const ICE: RTCConfiguration = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }],
};

interface Peer {
  pc: RTCPeerConnection;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  userId: string;
}

const peers = new Map<string, Peer>(); // remoteSocketId -> Peer
let audioCtx: AudioContext | null = null;
let rawMic: MediaStream | null = null; // unprocessed mic
let gainNode: GainNode | null = null;
let sentStream: MediaStream | null = null; // processed audio we send
let screenStream: MediaStream | null = null;
let pttDown = false;
let inited = false;

const st = () => useVoice.getState();
const cfg = () => useSettings.getState();

// ── Mic pipeline ─────────────────────────────────────────────────────────
async function buildMicStream(): Promise<MediaStream> {
  const s = cfg();
  rawMic = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: s.inputDeviceId ? { exact: s.inputDeviceId } : undefined,
      echoCancellation: s.echoCancellation,
      noiseSuppression: s.noiseSuppression,
      autoGainControl: s.autoGainControl,
    },
  });
  try {
    audioCtx = new AudioContext();
    await audioCtx.resume();
    const src = audioCtx.createMediaStreamSource(rawMic);
    gainNode = audioCtx.createGain();
    gainNode.gain.value = s.inputVolume / 100;
    const dest = audioCtx.createMediaStreamDestination();
    src.connect(gainNode).connect(dest);
    sentStream = dest.stream;
  } catch {
    // WebAudio unavailable → send raw mic (no input-volume control).
    sentStream = rawMic;
  }
  return sentStream;
}

/** Mic track enabled = not muted, and (voice-activity OR push-to-talk held). */
function applyMicState() {
  if (!sentStream) return;
  const ptt = cfg().voiceMode === "ptt";
  const enabled = !st().muted && (!ptt || pttDown);
  sentStream.getAudioTracks().forEach((t) => (t.enabled = enabled));
}

/** Live input volume (0–200%). */
export function setInputVolume(percent: number) {
  cfg().set({ inputVolume: percent });
  if (gainNode) gainNode.gain.value = percent / 100;
}

/** Re-acquire the mic with current settings and swap it into every call. */
export async function refreshMic() {
  if (!st().channelId) return;
  const old = { ctx: audioCtx, raw: rawMic };
  await buildMicStream();
  const track = sentStream!.getAudioTracks()[0];
  peers.forEach((p) => {
    const sender = p.pc.getSenders().find((s) => s.track?.kind === "audio");
    if (sender && track) sender.replaceTrack(track);
  });
  applyMicState();
  old.raw?.getTracks().forEach((t) => t.stop());
  old.ctx?.close().catch(() => {});
}

// ── Peer (perfect negotiation) ─────────────────────────────────────────────
function upsertRemote(socketId: string, userId: string, stream: MediaStream) {
  const hasVideo = stream.getVideoTracks().length > 0;
  const remotes = st().remotes.filter((r) => r.socketId !== socketId);
  remotes.push({ socketId, userId, stream, hasVideo });
  st().set({ remotes });
}
function dropRemote(socketId: string) {
  st().set({ remotes: st().remotes.filter((r) => r.socketId !== socketId) });
}
function signal(to: string, data: Record<string, unknown>) {
  getSocket()?.emit("voice:signal", { to, ...data });
}

function createPeer(socketId: string, userId: string): Peer {
  const existing = peers.get(socketId);
  if (existing) return existing;

  const myId = getSocket()?.id ?? "";
  const pc = new RTCPeerConnection(ICE);
  const peer: Peer = { pc, polite: myId < socketId, makingOffer: false, ignoreOffer: false, userId };
  peers.set(socketId, peer);

  sentStream?.getTracks().forEach((t) => pc.addTrack(t, sentStream!));
  screenStream?.getTracks().forEach((t) => pc.addTrack(t, screenStream!));

  pc.ontrack = (e) => upsertRemote(socketId, userId, e.streams[0]);
  pc.onicecandidate = (e) => {
    if (e.candidate) signal(socketId, { candidate: e.candidate });
  };
  pc.onnegotiationneeded = async () => {
    try {
      peer.makingOffer = true;
      await pc.setLocalDescription();
      signal(socketId, { description: pc.localDescription });
    } catch (err) {
      console.error("[voice] negotiation error", err);
    } finally {
      peer.makingOffer = false;
    }
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed") pc.restartIce();
  };
  return peer;
}

async function onSignal(payload: {
  from: string;
  fromUserId: string;
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}) {
  const { from, fromUserId, description, candidate } = payload;
  const peer = createPeer(from, fromUserId);
  const pc = peer.pc;
  try {
    if (description) {
      const collision =
        description.type === "offer" && (peer.makingOffer || pc.signalingState !== "stable");
      peer.ignoreOffer = !peer.polite && collision;
      if (peer.ignoreOffer) return;
      await pc.setRemoteDescription(description);
      if (description.type === "offer") {
        await pc.setLocalDescription();
        signal(from, { description: pc.localDescription });
      }
    } else if (candidate) {
      try {
        await pc.addIceCandidate(candidate);
      } catch (err) {
        if (!peer.ignoreOffer) console.error("[voice] addIceCandidate", err);
      }
    }
  } catch (err) {
    console.error("[voice] signal handling error", err);
  }
}

/** Attach voice signaling + push-to-talk listeners once. */
export function initVoice() {
  if (inited) return;
  const socket = getSocket();
  if (!socket) return;
  inited = true;

  socket.on("voice:peerJoined", ({ socketId, userId }: { socketId: string; userId: string }) => {
    if (st().channelId) createPeer(socketId, userId);
  });
  socket.on("voice:peerLeft", ({ socketId }: { socketId: string }) => {
    peers.get(socketId)?.pc.close();
    peers.delete(socketId);
    dropRemote(socketId);
  });
  socket.on("voice:signal", onSignal);
  socket.on("voice:state", ({ channelId, userIds }: { channelId: string; userIds: string[] }) => {
    st().set({ occupancy: { ...st().occupancy, [channelId]: userIds } });
  });

  // Push-to-talk key handling (only matters in PTT mode while connected).
  const onKey = (down: boolean) => (e: KeyboardEvent) => {
    if (cfg().voiceMode !== "ptt" || !st().channelId) return;
    if (e.code !== cfg().pttKey) return;
    if (e.repeat) return;
    pttDown = down;
    applyMicState();
  };
  window.addEventListener("keydown", onKey(true));
  window.addEventListener("keyup", onKey(false));
}

export async function joinVoice(channelId: string) {
  if (st().channelId === channelId) return;
  await leaveVoice();
  st().set({ connecting: true });
  try {
    await buildMicStream();
  } catch {
    st().set({ connecting: false });
    alert("Microphone access was denied.");
    return;
  }
  st().set({ channelId, connecting: false, muted: false });
  applyMicState();

  getSocket()?.emit(
    "voice:join",
    { channelId },
    (res: { ok: boolean; peers?: { socketId: string; userId: string }[] }) => {
      if (res?.ok) res.peers?.forEach((p) => createPeer(p.socketId, p.userId));
    }
  );
}

export async function leaveVoice() {
  const channelId = st().channelId;
  if (channelId) getSocket()?.emit("voice:leave", { channelId });
  peers.forEach((p) => p.pc.close());
  peers.clear();
  rawMic?.getTracks().forEach((t) => t.stop());
  screenStream?.getTracks().forEach((t) => t.stop());
  audioCtx?.close().catch(() => {});
  audioCtx = null;
  rawMic = null;
  sentStream = null;
  gainNode = null;
  screenStream = null;
  st().set({ channelId: null, remotes: [], screenOn: false, muted: false, localScreen: null });
}

export function toggleMute() {
  st().set({ muted: !st().muted });
  applyMicState();
}

// Screen share using the user's chosen resolution/FPS (no hard cap).
export async function toggleScreen() {
  if (st().screenOn) {
    screenStream?.getTracks().forEach((track) => {
      track.stop();
      peers.forEach((p) => {
        const sender = p.pc.getSenders().find((s) => s.track === track);
        if (sender) p.pc.removeTrack(sender);
      });
    });
    screenStream = null;
    st().set({ screenOn: false, localScreen: null });
    return;
  }
  const s = cfg();
  const video: MediaTrackConstraints =
    s.screenResolution === "source"
      ? { frameRate: { ideal: s.screenFps } }
      : { ...RES_MAP[s.screenResolution], frameRate: { ideal: s.screenFps } };
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video, audio: s.screenAudio });
  } catch {
    return;
  }
  screenStream.getTracks().forEach((t) => peers.forEach((p) => p.pc.addTrack(t, screenStream!)));
  screenStream.getVideoTracks()[0]?.addEventListener("ended", () => {
    if (st().screenOn) toggleScreen();
  });
  st().set({ screenOn: true, localScreen: screenStream });
}

// ── Mic test (used in Settings): live input level 0–1 via callback. ─────────
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
  src.connect(gain).connect(analyser);
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

/** Enumerate audio input/output devices (labels need a prior permission grant). */
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
