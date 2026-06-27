import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { useVoice, type RemoteEntry } from "../store/voice";
import { useSettings } from "../store/settings";
import { useVoiceVolumes } from "../store/voiceVolumes";
import { useI18n } from "../lib/i18n";
import Avatar from "./Avatar";
import type { User } from "../types";

// Always-mounted: plays remote audio (honoring output device + volume) and
// shows a grid of any screen-share video. Click a tile to expand; expanded
// view has a true-fullscreen button.
export default function VoiceOverlay() {
  const { remotes, localScreen, localCamera, screenOn, cameraOn, effects, channelId } = useVoice();
  const [expanded, setExpanded] = useState<{ stream: MediaStream; label: string } | null>(null);

  const audioStreams = remotes.filter((r) => r.audio);
  const screenTiles = remotes.filter((r) => r.screen);
  const cameraTiles = remotes.filter((r) => r.camera);
  // Screen shares can carry system audio (loopback) in their stream — play it
  // through a dedicated audio element (the video tiles are muted to avoid echo).
  const screenAudio = remotes.filter((r) => r.screen && r.screen.getAudioTracks().length > 0);
  const showGrid = screenOn || cameraOn || screenTiles.length > 0 || cameraTiles.length > 0;

  return (
    <>
      {audioStreams.map((r) => (
        <AudioSink key={r.socketId} userId={r.userId} stream={r.audio!} />
      ))}
      {screenAudio.map((r) => (
        <AudioSink key={`sa-${r.socketId}`} userId={r.userId} stream={r.screen!} />
      ))}

      {channelId && remotes.length > 0 && <ParticipantsPanel remotes={remotes} />}

      {/* Floating emoji reactions during a call */}
      {channelId && effects.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center">
          <div className="relative h-40 w-40">
            {effects.map((e) => (
              <span
                key={e.id}
                className="absolute bottom-0 text-4xl"
                style={{ left: `${20 + ((e.id * 37) % 60)}%`, animation: "float-up 4.4s ease-out forwards" }}
              >
                {e.emoji}
              </span>
            ))}
          </div>
        </div>
      )}

      {showGrid && (
        <div className="pointer-events-none fixed bottom-20 right-4 z-40 flex max-w-[60vw] flex-wrap justify-end gap-2">
          {screenOn && localScreen && (
            <VideoTile stream={localScreen} label="Your screen" muted onExpand={setExpanded} />
          )}
          {cameraOn && localCamera && (
            <VideoTile stream={localCamera} label="You" muted onExpand={setExpanded} />
          )}
          {screenTiles.map((r) => (
            <VideoTile key={`s-${r.socketId}`} stream={r.screen!} label="Screen share" muted onExpand={setExpanded} />
          ))}
          {cameraTiles.map((r) => (
            <VideoTile key={`c-${r.socketId}`} stream={r.camera!} label="Camera" onExpand={setExpanded} />
          ))}
        </div>
      )}

      {expanded && <ExpandedView entry={expanded} onClose={() => setExpanded(null)} />}
    </>
  );
}

function AudioSink({ stream, userId }: { stream: MediaStream; userId: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const { outputVolume, outputDeviceId } = useSettings();
  const userVol = useVoiceVolumes((s) => s.volumes[userId] ?? 100);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  useEffect(() => {
    const el = ref.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (!el) return;
    // Combine the global output volume with this user's personal volume (local only).
    el.volume = Math.min((outputVolume / 100) * (userVol / 100), 1);
    if (outputDeviceId && el.setSinkId) el.setSinkId(outputDeviceId).catch(() => {});
  }, [outputVolume, outputDeviceId, userVol]);
  return <audio ref={ref} autoPlay />;
}

// Small panel listing the other people in the call, each with a personal volume
// slider (local-only — never affects what others hear).
function ParticipantsPanel({ remotes }: { remotes: RemoteEntry[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(true);
  // De-dupe by userId (a user may have several streams/sockets).
  const byUser = new Map<string, RemoteEntry>();
  for (const r of remotes) if (!byUser.has(r.userId)) byUser.set(r.userId, r);
  const users = [...byUser.values()];
  if (users.length === 0) return null;

  return (
    <div className="pointer-events-auto fixed bottom-20 left-4 z-40 w-60 rounded-lg bg-discord-rail/95 shadow-xl ring-1 ring-black/40">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-bold uppercase tracking-wide text-discord-muted"
      >
        <span>{t("voice.participants")} — {users.length}</span>
        <span>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="max-h-64 space-y-2 overflow-y-auto px-3 pb-3">
          {users.map((r) => (
            <ParticipantRow key={r.userId} userId={r.userId} speaking={false} />
          ))}
        </div>
      )}
    </div>
  );
}

function ParticipantRow({ userId }: { userId: string; speaking?: boolean }) {
  const { data: user } = useQuery<User>({
    queryKey: ["profile", userId],
    queryFn: () => api<User>(`/api/users/${userId}`),
    staleTime: 5 * 60_000,
  });
  const vol = useVoiceVolumes((s) => s.volumes[userId] ?? 100);
  const setVolume = useVoiceVolumes((s) => s.setVolume);
  const name = user?.displayName ?? user?.username ?? "…";

  return (
    <div>
      <div className="flex items-center gap-2">
        <Avatar user={user ?? { username: "?", displayName: name, avatarUrl: null }} size={24} status={user?.status ?? "ONLINE"} />
        <span className="min-w-0 flex-1 truncate text-sm text-discord-text">{name}</span>
        <span className="text-[10px] tabular-nums text-discord-faint">{vol}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={200}
        value={vol}
        onChange={(e) => setVolume(userId, Number(e.target.value))}
        className="mt-1 w-full accent-discord-accent"
      />
    </div>
  );
}

function VideoTile({
  stream,
  label,
  muted,
  onExpand,
}: {
  stream: MediaStream;
  label: string;
  muted?: boolean;
  onExpand: (e: { stream: MediaStream; label: string }) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream;
      ref.current.muted = !!muted; // imperative: React's `muted` prop is unreliable
    }
  }, [stream, muted]);
  return (
    <div className="pointer-events-auto group relative overflow-hidden rounded-lg border border-black/40 bg-black shadow-xl">
      <video ref={ref} autoPlay playsInline className="h-48 w-80 object-contain" />
      <button
        onClick={() => onExpand({ stream, label })}
        className="absolute right-1 top-1 rounded bg-black/60 px-2 py-1 text-xs text-white opacity-0 transition group-hover:opacity-100"
        title="Expand"
      >
        ⛶ Expand
      </button>
      <span className="absolute bottom-1 left-2 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
        {label}
      </span>
    </div>
  );
}

// Large centered viewer with a real fullscreen button.
function ExpandedView({
  entry,
  onClose,
}: {
  entry: { stream: MediaStream; label: string };
  onClose: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = entry.stream;
  }, [entry.stream]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !document.fullscreenElement && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90" onMouseDown={onClose}>
      <div className="flex items-center justify-between px-4 py-2 text-white" onMouseDown={(e) => e.stopPropagation()}>
        <span className="font-medium">{entry.label}</span>
        <div className="flex gap-2">
          <button
            onClick={() => ref.current?.requestFullscreen?.()}
            className="rounded bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20"
          >
            ⛶ Fullscreen
          </button>
          <button onClick={onClose} className="rounded bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20">
            ✕ Close
          </button>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center p-4" onMouseDown={(e) => e.stopPropagation()}>
        {/* Muted: any system audio plays through the dedicated audio sink. */}
        <video ref={ref} autoPlay playsInline muted className="max-h-full max-w-full" />
      </div>
    </div>
  );
}
