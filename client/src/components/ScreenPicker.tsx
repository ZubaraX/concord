import { useScreenPicker } from "../store/screenPicker";
import { useI18n } from "../lib/i18n";

// Discord-style "choose what to share" picker: screens first, then app windows.
export default function ScreenPicker() {
  const { sources, pick } = useScreenPicker();
  const { t } = useI18n();
  if (!sources) return null;

  const screens = sources.filter((s) => s.isScreen);
  const windows = sources.filter((s) => !s.isScreen);

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 p-6" onMouseDown={() => pick(null)}>
      <div
        className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-discord-rail shadow-2xl ring-1 ring-black/40"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-lg font-bold text-white">{t("screen.title")}</h2>
          <button onClick={() => pick(null)} className="rounded p-1 text-discord-muted hover:text-white">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {screens.length > 0 && (
            <>
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-discord-muted">{t("screen.screens")}</div>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {screens.map((s) => (
                  <SourceTile key={s.id} src={s} onPick={() => pick(s.id)} />
                ))}
              </div>
            </>
          )}
          {windows.length > 0 && (
            <>
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-discord-muted">{t("screen.windows")}</div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {windows.map((s) => (
                  <SourceTile key={s.id} src={s} onPick={() => pick(s.id)} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SourceTile({ src, onPick }: { src: DesktopSource; onPick: () => void }) {
  return (
    <button
      onClick={onPick}
      className="group overflow-hidden rounded-lg bg-black/30 ring-1 ring-transparent transition hover:ring-2 hover:ring-discord-accent"
    >
      <img src={src.thumbnail} alt="" className="aspect-video w-full bg-black object-contain" />
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        {src.appIcon && <img src={src.appIcon} alt="" className="h-4 w-4 shrink-0" />}
        <span className="truncate text-xs text-discord-text">{src.name}</span>
      </div>
    </button>
  );
}
