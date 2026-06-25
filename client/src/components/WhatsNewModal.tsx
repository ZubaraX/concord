import type { ChangelogEntry } from "../lib/changelog";

// Shown once after the app auto-updates: a tidy list of what changed across all
// versions the user skipped.
export default function WhatsNewModal({
  entries,
  onClose,
}: {
  entries: ChangelogEntry[];
  onClose: () => void;
}) {
  const latest = entries[0]?.version;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-discord-rail shadow-2xl ring-1 ring-black/40"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-discord-accent/15 px-6 py-5">
          <div className="text-xs font-bold uppercase tracking-wide text-discord-accent">Обновление установлено</div>
          <h2 className="mt-1 text-xl font-bold text-white">Что нового{latest ? ` — v${latest}` : ""}</h2>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {entries.map((e) => (
            <div key={e.version}>
              <div className="mb-2 flex items-baseline gap-2">
                <span className="text-sm font-semibold text-discord-text">v{e.version}</span>
                <span className="text-xs text-discord-faint">{e.date}</span>
              </div>
              <ul className="space-y-1.5">
                {e.items.map((it, i) => (
                  <li key={i} className="flex gap-2 text-sm text-discord-text">
                    <span className="mt-0.5 text-discord-accent">•</span>
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-black/30 px-6 py-4">
          <button
            onClick={onClose}
            className="w-full rounded-lg bg-discord-accent py-2.5 font-medium text-white hover:brightness-110"
          >
            Понятно
          </button>
        </div>
      </div>
    </div>
  );
}
