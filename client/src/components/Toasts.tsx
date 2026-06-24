import { useNotify } from "../store/notify";

// Top-right in-app notifications (new DM, incoming call).
export default function Toasts() {
  const { toasts, dismiss } = useNotify();
  if (toasts.length === 0) return null;

  return (
    <div className="fixed right-4 top-4 z-[60] flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className="rounded-lg bg-discord-rail p-3 shadow-xl ring-1 ring-black/40">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-semibold text-white">{t.title}</div>
              {t.body && <div className="mt-0.5 line-clamp-2 text-sm text-discord-muted">{t.body}</div>}
            </div>
            <button onClick={() => dismiss(t.id)} className="shrink-0 text-discord-muted hover:text-white" aria-label="Dismiss">
              ✕
            </button>
          </div>
          {t.actionLabel && (
            <button
              onClick={() => {
                t.onAction?.();
                dismiss(t.id);
              }}
              className="mt-2 w-full rounded bg-discord-green py-1.5 text-sm font-medium text-white hover:brightness-110"
            >
              {t.actionLabel}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
