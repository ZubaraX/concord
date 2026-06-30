import { useEffect, useState } from "react";
import { useI18n } from "../lib/i18n";
import { appVersion, cmpVersion } from "../lib/changelog";
import { DownloadIcon, XIcon } from "./Icons";

// Android-only update check. Android won't let a sideloaded app silently swap
// its own APK, so we check a published manifest on launch and, if a newer
// version exists, show a banner that downloads + installs the new APK (one tap).
const MANIFEST_URL =
  "https://github.com/ZubaraX/concord/releases/download/android/android-latest.json";

export default function AndroidUpdate() {
  const { t } = useI18n();
  const [latest, setLatest] = useState<{ version: string; url: string } | null>(null);

  useEffect(() => {
    const platform = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.();
    if (platform !== "android") return; // desktop/web: nothing to do
    fetch(MANIFEST_URL, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((m: { version?: string; url?: string } | null) => {
        if (m?.version && m.url && cmpVersion(m.version, appVersion()) > 0) {
          setLatest({ version: m.version, url: m.url });
        }
      })
      .catch(() => {});
  }, []);

  if (!latest) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[120] flex items-center justify-between gap-3 bg-discord-accent px-4 py-2 text-sm text-white shadow-panel">
      <span className="truncate">{t("android.updateTitle", { v: latest.version })}</span>
      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={() => window.open(latest.url, "_blank")}
          className="flex items-center gap-1.5 rounded bg-white/20 px-3 py-1 font-medium hover:bg-white/30"
        >
          <DownloadIcon size={15} /> {t("android.update")}
        </button>
        <button onClick={() => setLatest(null)} aria-label="Close" className="rounded p-1 hover:bg-white/20">
          <XIcon size={15} />
        </button>
      </div>
    </div>
  );
}
