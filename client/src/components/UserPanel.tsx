import { useEffect, useRef, useState } from "react";
import { useAuth } from "../store/auth";
import { useUI } from "../store/ui";
import { useI18n } from "../lib/i18n";
import type { PresenceStatus } from "../types";
import { GearIcon } from "./Icons";
import Avatar from "./Avatar";

// Bottom-left user panel: avatar (click → status picker), name, settings gear.
export default function UserPanel() {
  const { user, updateProfile } = useAuth();
  const { openModal } = useUI();
  const { t } = useI18n();
  const [statusOpen, setStatusOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!statusOpen) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setStatusOpen(false);
    };
    const id = setTimeout(() => window.addEventListener("mousedown", onDown), 0);
    return () => {
      clearTimeout(id);
      window.removeEventListener("mousedown", onDown);
    };
  }, [statusOpen]);

  if (!user) return null;

  const setStatus = (status: PresenceStatus) => {
    setStatusOpen(false);
    updateProfile({ status }).catch(() => {});
  };

  const STATUSES: { value: PresenceStatus; dot: string; label: string }[] = [
    { value: "ONLINE", dot: "bg-discord-green", label: t("status.online") },
    { value: "IDLE", dot: "bg-yellow-500", label: t("status.idle") },
    { value: "DND", dot: "bg-discord-danger", label: t("status.dnd") },
    { value: "OFFLINE", dot: "bg-discord-faint", label: t("status.invisible") },
  ];

  return (
    <div ref={ref} className="relative flex items-center gap-2 bg-discord-rail px-2 py-1.5">
      <button onClick={() => setStatusOpen((v) => !v)} title={t("status.online") + " / " + t("status.dnd")} className="rounded-full">
        <Avatar user={user} size={32} status={user.status ?? "ONLINE"} />
      </button>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-sm font-semibold text-white">
          {user.displayName ?? user.username}
        </div>
        <div className="truncate text-xs text-discord-muted">
          {user.customStatus || `${user.username}#${user.discriminator}`}
        </div>
      </div>
      <button
        onClick={() => openModal("settings")}
        title={t("settings.title")}
        className="rounded p-1.5 text-discord-muted transition hover:bg-discord-hover hover:text-white"
      >
        <GearIcon size={20} />
      </button>

      {statusOpen && (
        <div className="cc-pop absolute bottom-12 left-2 z-[70] w-48 rounded-lg bg-discord-rail p-1.5 shadow-xl ring-1 ring-black/40">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              onClick={() => setStatus(s.value)}
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm ${
                (user.status ?? "ONLINE") === s.value ? "bg-discord-active text-white" : "text-discord-text hover:bg-discord-hover"
              }`}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
