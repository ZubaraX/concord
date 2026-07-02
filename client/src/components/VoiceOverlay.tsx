import { useEffect, useRef, useState } from "react";
import { useVoice } from "../store/voice";
import { useSettings } from "../store/settings";
import { useVoiceVolumes, screenVolKey } from "../store/voiceVolumes";
import { useScreenView } from "../store/screenView";
import { ExpandIcon, XIcon } from "./Icons";

// Always-mounted: plays remote audio (honoring output device + per-user volume)
// and shows a grid of any screen-share / camera video. Per-user volume and
// hide-screen controls now live on the participant rows in the channel sidebar
// (VoiceUserPopover), so there's no floating panel here anymore.
export default function VoiceOverlay() {
  const { remotes, localScreen, localCamera, screenOn, cameraOn, effects, channelId } = useVoice();
  const [expanded, setExpanded] = useState<{ stream: MediaStream; label: string } | null>(null);
  const hidden = useScreenView((s) => s.hidden);

  const audioStreams = remotes.filter((r) => r.audio);
  // A screen share the viewer chose to hide is neither shown nor heard.
  const screenTiles = remotes.filter((r) => r.screen && !hidden[r.userId]);
  const cameraTiles = remotes.filter((r) => r.camera);
  // Screen shares can carry system audio (loopback) — play it through a
  // dedicated audio element (the video tiles are muted to avoid echo).
  const screenAudio = remotes.filter((r) => r.screen && !hidden[r.userId] && r.screen.getAudioTracks().length > 0);
  const showGrid = screenOn || cameraOn || screenTiles.length > 0 || cameraTiles.length > 0;

  return (
    <>
      {audioStreams.map((r) => (
        <AudioSink key={r.socketId} userId={r.userId} stream={r.audio!} />
      ))}
      {screenAudio.map((r) => (
        <AudioSink key={`sa-${r.socketId}`} userId={r.userId} volKey={screenVolKey(r.userId)} stream={r.screen!} />
      ))}

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
        <div className="pointer-events-none fixed bottom-20 right-4 z-40 flex max-w-[60vw] flex-wrap justify-end gap-2 max-md:left-4 max-md:max-w-none">
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

function AudioSink({ stream, userId, volKey }: { stream: MediaStream; userId: string; volKey?: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const { outputVolume, outputDeviceId } = useSettings();
  const deafened = useVoice((s) => s.deafened);
  const userVol = useVoiceVolumes((s) => s.volumes[volKey ?? userId] ?? 100);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  useEffect(() => {
    const el = ref.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (!el) return;
    // Combine the global output volume with this user's personal volume (local only).
    el.volume = deafened ? 0 : Math.min((outputVolume / 100) * (userVol / 100), 1);
    if (outputDeviceId && el.setSinkId) el.setSinkId(outputDeviceId).catch(() => {});
  }, [outputVolume, outputDeviceId, userVol, deafened]);
  return <audio ref={ref} autoPlay />;
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
      <video ref={ref} autoPlay playsInline className="h-48 w-80 max-w-[76vw] object-contain" />
      <button
        onClick={() => onExpand({ stream, label })}
        className="cc-touch-show absolute right-1 top-1 flex items-center gap-1 rounded bg-black/60 px-2 py-1 text-xs text-white opacity-0 transition group-hover:opacity-100"
        title="Expand"
      >
        <ExpandIcon size={14} />
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
            className="flex items-center gap-1.5 rounded bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20"
          >
            <ExpandIcon size={15} /> Fullscreen
          </button>
          <button onClick={onClose} className="flex items-center gap-1.5 rounded bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20">
            <XIcon size={15} /> Close
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
