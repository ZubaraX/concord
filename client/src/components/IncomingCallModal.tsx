import { useEffect } from "react";
import { startRing } from "../lib/sound";

// Discord-style incoming call: ringtone loops while shown; Accept / Decline.
export default function IncomingCallModal({
  name,
  onAccept,
  onDecline,
}: {
  name: string;
  onAccept: () => void;
  onDecline: () => void;
}) {
  useEffect(() => startRing(), []); // ring while mounted, stop on unmount

  return (
    <div className="fixed inset-x-0 top-6 z-[80] flex justify-center">
      <div className="cc-pop w-80 rounded-xl bg-discord-rail p-5 text-center shadow-2xl ring-1 ring-black/40">
        <div className="cc-glow mx-auto mb-3 flex h-16 w-16 animate-pulse items-center justify-center rounded-full bg-discord-green text-3xl">
          📞
        </div>
        <div className="text-lg font-semibold text-white">{name}</div>
        <div className="text-sm text-discord-muted">Incoming call…</div>
        <div className="mt-4 flex gap-3">
          <button
            onClick={onDecline}
            className="flex-1 rounded-lg bg-discord-danger py-2.5 font-medium text-white hover:brightness-110"
          >
            Decline
          </button>
          <button
            onClick={onAccept}
            className="flex-1 rounded-lg bg-discord-green py-2.5 font-medium text-white hover:brightness-110"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
