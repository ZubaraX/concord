import { useEffect } from "react";
import { createPortal } from "react-dom";
import { startRing } from "../lib/sound";
import { useI18n } from "../lib/i18n";
import type { User } from "../types";
import Avatar from "./Avatar";
import { PhoneIcon, PhoneOffIcon } from "./Icons";

// Full-screen incoming-call overlay: pulsing avatar, caller name, big round
// accept/decline buttons. The melodic ringtone loops while mounted.
export default function IncomingCallModal({
  name,
  avatarUrl,
  onAccept,
  onDecline,
}: {
  name: string;
  avatarUrl?: string | null;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const { t } = useI18n();
  useEffect(() => startRing(), []); // ring while mounted, stop on unmount

  // Never ring forever — if nobody reacts in 60s, dismiss quietly.
  useEffect(() => {
    const id = setTimeout(onDecline, 60_000);
    return () => clearTimeout(id);
  }, [onDecline]);

  const caller = { id: "incoming-caller", username: name, displayName: name, avatarUrl: avatarUrl ?? null } as unknown as User;

  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="cc-pop flex w-[320px] max-w-full flex-col items-center rounded-2xl bg-discord-rail p-8 text-center shadow-2xl ring-1 ring-white/10">
        <div className="relative mb-5 h-24 w-24">
          <span className="absolute inset-0 animate-ping rounded-full bg-discord-green/30" />
          <span className="absolute -inset-3 animate-ping rounded-full bg-discord-green/15 [animation-delay:250ms]" />
          <div className="relative">
            <Avatar user={caller} size={96} />
          </div>
        </div>
        <div className="max-w-full truncate text-xl font-bold text-white">{name}</div>
        <div className="mt-1 text-sm text-discord-muted">{t("call.incoming")}</div>
        <div className="mt-7 flex items-start gap-12">
          <div className="flex flex-col items-center gap-1.5">
            <button
              onClick={onDecline}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-discord-danger text-white shadow-lg transition hover:scale-105 hover:brightness-110"
              title={t("call.decline")}
            >
              <PhoneOffIcon size={24} />
            </button>
            <span className="text-xs text-discord-muted">{t("call.decline")}</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <button
              onClick={onAccept}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-discord-green text-white shadow-lg transition hover:scale-105 hover:brightness-110"
              title={t("call.accept")}
            >
              <PhoneIcon size={24} />
            </button>
            <span className="text-xs text-discord-muted">{t("call.accept")}</span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
