import { useEffect, useRef, useState } from "react";
import { useVoice } from "../store/voice";
import { useSettings } from "../store/settings";

// Always-mounted: plays remote audio (honoring output device + volume) and
// shows a grid of any screen-share video. Click a tile to expand; expanded
// view has a true-fullscreen button.
export default function VoiceOverlay() {
  const { remotes, localScreen, localCamera, screenOn, cameraOn, effects, channelId } = useVoice();
  const [expanded, setExpanded] = useState<{ stream: MediaStream; label: string } | null>(null);

  const audioStreams = remotes.filter((r) => r.audio);
  const screenTiles = remotes.filter((r) => r.screen);
  const cameraTiles = remotes.filter((r) => r.camera);
  const showGrid = screenOn || cameraOn || screenTiles.length > 0 || cameraTiles.length > 0;

  return (
    <>
      {audioStreams.map((r) => (
        <AudioSink key={r.socketId} stream={r.audio!} />
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
        <div className="pointer-events-none fixed bottom-20 right-4 z-40 flex max-w-[60vw] flex-wrap justify-end gap-2">
          {screenOn && localScreen && (
            <VideoTile stream={localScreen} label="Your screen" muted onExpand={setExpanded} />
          )}
          {cameraOn && localCamera && (
            <VideoTile stream={localCamera} label="You" muted onExpand={setExpanded} />
          )}
          {screenTiles.map((r) => (
            <VideoTile key={`s-${r.socketId}`} stream={r.screen!} label="Screen share" onExpand={setExpanded} />
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

function AudioSink({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);
  const { outputVolume, outputDeviceId } = useSettings();
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  useEffect(() => {
    const el = ref.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (!el) return;
    el.volume = Math.min(outputVolume / 100, 1);
    if (outputDeviceId && el.setSinkId) el.setSinkId(outputDeviceId).catch(() => {});
  }, [outputVolume, outputDeviceId]);
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
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <div className="pointer-events-auto group relative overflow-hidden rounded-lg border border-black/40 bg-black shadow-xl">
      <video ref={ref} autoPlay playsInline muted={muted} className="h-48 w-80 object-contain" />
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
        {/* No native controls — a screen share is a live stream, not a video file. */}
        <video ref={ref} autoPlay playsInline className="max-h-full max-w-full" />
      </div>
    </div>
  );
}
