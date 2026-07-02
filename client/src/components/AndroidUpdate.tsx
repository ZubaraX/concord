import { useEffect, useState } from "react";
import { CapacitorHttp } from "@capacitor/core";
import { useI18n } from "../lib/i18n";
import { appVersion, cmpVersion } from "../lib/changelog";
import { isAndroidApp } from "../lib/platform";
import { DownloadIcon, XIcon } from "./Icons";

// Android-only update check. Android won't let a sideloaded app silently swap
// its own APK, so we check a published manifest on launch and, if a newer
// version exists, show a banner that downloads + installs the new APK (one tap).
const MANIFEST_URL =
  "https://github.com/ZubaraX/concord/releases/download/android/android-latest.json";

// The manifest must be fetched natively (CapacitorHttp): a browser fetch() dies
// on CORS — github.com's 302 redirect to the asset CDN has no CORS headers.
async function fetchManifest(): Promise<{ version: string; url: string } | null> {
  try {
    // Cache-buster: the asset is re-uploaded under the same URL on every release.
    const res = await CapacitorHttp.get({ url: `${MANIFEST_URL}?ts=${Date.now()}` });
    if (res.status !== 200) return null;
    const m = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
    return m?.version && m?.url ? { version: m.version, url: m.url } : null;
  } catch {
    return null;
  }
}

export default function AndroidUpdate() {
  const { t } = useI18n();
  const [latest, setLatest] = useState<{ version: string; url: string } | null>(null);

  useEffect(() => {
    if (!isAndroidApp()) return; // desktop/web: nothing to do
    let cancelled = false;
    const check = () =>
      fetchManifest().then((m) => {
        if (!cancelled && m && cmpVersion(m.version, appVersion()) > 0) setLatest(m);
      });
    check();
    // Re-check whenever the app comes back to the foreground.
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!latest) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[120] flex items-center justify-between gap-3 bg-discord-accent px-4 py-2 text-sm text-white shadow-panel">
      <span className="truncate">{t("android.updateTitle", { v: latest.version })}</span>
      <div className="flex shrink-0 items-center gap-2">
        <button
          // External URL → Capacitor hands it to the system browser, which
          // downloads the APK and offers to install it (window.open is a no-op
          // in the WebView).
          onClick={() => { window.location.href = latest.url; }}
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
