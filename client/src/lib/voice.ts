// WebRTC P2P voice + screen-share manager (mesh topology with Socket.io
// signaling, using the "perfect negotiation" pattern so simultaneous offers
// don't deadlock). Good for small voice channels; an SFU (mediasoup) is the
// path to large rooms — the signaling shape here maps cleanly onto that later.
import { getSocket } from "./socket";
import { useVoice } from "../store/voice";

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
let localStream: MediaStream | null = null;
let screenStream: MediaStream | null = null;
let inited = false;

const st = () => useVoice.getState();

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
  // Deterministic + opposite on each side → exactly one polite peer per pair.
  const peer: Peer = { pc, polite: myId < socketId, makingOffer: false, ignoreOffer: false, userId };
  peers.set(socketId, peer);

  localStream?.getTracks().forEach((t) => pc.addTrack(t, localStream!));
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

/** Attach the voice signaling listeners once (after the socket exists). */
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
}

export async function joinVoice(channelId: string) {
  if (st().channelId === channelId) return;
  await leaveVoice();
  st().set({ connecting: true });
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch {
    st().set({ connecting: false });
    alert("Microphone access was denied.");
    return;
  }
  st().set({ channelId, connecting: false, muted: false });

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
  localStream?.getTracks().forEach((t) => t.stop());
  screenStream?.getTracks().forEach((t) => t.stop());
  localStream = null;
  screenStream = null;
  st().set({ channelId: null, remotes: [], screenOn: false, muted: false });
}

export function toggleMute() {
  if (!localStream) return;
  const muted = !st().muted;
  localStream.getAudioTracks().forEach((t) => (t.enabled = !muted));
  st().set({ muted });
}

// Screen share at maximum available quality (no resolution/FPS cap).
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
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { width: { ideal: 3840 }, height: { ideal: 2160 }, frameRate: { ideal: 60 } },
      audio: true,
    });
  } catch {
    return;
  }
  screenStream.getTracks().forEach((t) => peers.forEach((p) => p.pc.addTrack(t, screenStream!)));
  screenStream.getVideoTracks()[0]?.addEventListener("ended", () => {
    if (st().screenOn) toggleScreen();
  });
  st().set({ screenOn: true, localScreen: screenStream });
}
