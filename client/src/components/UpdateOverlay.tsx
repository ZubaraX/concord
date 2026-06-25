import { useEffect, useState } from "react";

// Full-screen loading screen shown while an update downloads at startup, before
// the app restarts into the new build. Only appears when there's actually an
// update in flight; a normal launch never shows it.
export default function UpdateOverlay() {
  const [status, setStatus] = useState<UpdateStatus>(
    () => window.concord?.getUpdateStatus?.() ?? { state: "idle" }
  );

  useEffect(() => {
    if (!window.concord?.onUpdate) return;
    return window.concord.onUpdate(setStatus);
  }, []);

  const downloading = status.state === "available" || status.state === "downloading";
  const done = status.state === "downloaded";
  if (!downloading && !done) return null;

  const percent = done ? 100 : Math.max(0, Math.min(100, status.percent ?? 0));

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-6 bg-discord-rail">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/15 border-t-discord-accent" />
      <div className="text-center">
        <div className="text-lg font-semibold text-white">
          {done ? "Установка обновления…" : "Загрузка обновления"}
          {status.version ? ` v${status.version}` : ""}
        </div>
        <div className="mt-1 text-sm text-discord-muted">
          {done ? "Приложение перезапустится автоматически" : "Пожалуйста, подождите"}
        </div>
      </div>

      <div className="h-2 w-72 overflow-hidden rounded-full bg-black/40">
        <div
          className="h-full rounded-full bg-discord-accent transition-[width] duration-200"
          style={{ width: `${percent}%` }}
        />
      </div>
      {!done && <div className="text-xs tabular-nums text-discord-faint">{percent}%</div>}
    </div>
  );
}
