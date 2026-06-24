import { useEffect, useRef } from "react";
import { useVoice } from "../store/voice";

// Always-mounted: plays remote audio and shows a floating grid of any video
// (screen-share) streams — local preview + remotes.
export default function VoiceOverlay() {
  const { remotes, localScreen, screenOn } = useVoice();
  const videoTiles = remotes.filter((r) => r.hasVideo);
  const showGrid = screenOn || videoTiles.length > 0;

  return (
    <>
      {/* Remote audio (hidden) */}
      {remotes.map((r) => (
        <AudioSink key={r.socketId} stream={r.stream} />
      ))}

      {showGrid && (
        <div className="pointer-events-none fixed bottom-20 right-4 z-40 flex max-w-[60vw] flex-wrap justify-end gap-2">
          {screenOn && localScreen && <VideoTile stream={localScreen} label="Your screen" muted />}
          {videoTiles.map((r) => (
            <VideoTile key={r.socketId} stream={r.stream} label="Screen share" />
          ))}
        </div>
      )}
    </>
  );
}

function AudioSink({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <audio ref={ref} autoPlay />;
}

function VideoTile({ stream, label, muted }: { stream: MediaStream; label: string; muted?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <div className="pointer-events-auto relative overflow-hidden rounded-lg border border-black/40 bg-black shadow-xl">
      <video ref={ref} autoPlay playsInline muted={muted} className="h-48 w-80 object-contain" />
      <span className="absolute bottom-1 left-2 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
        {label}
      </span>
    </div>
  );
}
