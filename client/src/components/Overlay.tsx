import { useEffect, useState } from "react";
import type { OverlayParticipant } from "./OverlayController";

// Rendered in the separate always-on-top overlay window. Self-contained (no app
// providers): it only listens for roster pushes from the main process.
export default function Overlay() {
  const [participants, setParticipants] = useState<OverlayParticipant[]>([]);

  useEffect(() => {
    if (!window.concord?.onOverlayData) return;
    return window.concord.onOverlayData((d) =>
      setParticipants(((d?.participants as OverlayParticipant[]) ?? []))
    );
  }, []);

  if (participants.length === 0) return null;

  return (
    <div className="flex select-none flex-col gap-1.5 p-2">
      {participants.map((p) => (
        <div
          key={p.userId}
          className={`flex items-center gap-2 rounded-lg bg-black/75 px-2 py-1.5 ring-2 transition ${
            p.speaking ? "ring-green-400" : "ring-transparent"
          }`}
        >
          {p.avatarUrl ? (
            <img src={p.avatarUrl} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-xs font-bold text-white">
              {p.name.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{p.name}</span>
          {p.muted && <span className="shrink-0 text-xs text-red-400">🔇</span>}
        </div>
      ))}
    </div>
  );
}
