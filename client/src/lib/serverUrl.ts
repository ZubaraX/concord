// Server location. When a build-time server URL is baked in (VITE_API_URL),
// it is authoritative and any saved override is ignored — so shipped builds
// always talk to the real server. Without a baked URL (e.g. web dev), fall
// back to a saved value or same-origin (Vite proxy).
//
// Resilience: builds may also bake VITE_API_URL_FALLBACK (the plain-IP http
// endpoint). Some networks can't reach the primary — mobile operators block
// sslip.io-style DNS, Android < 7.1.1 doesn't trust Let's Encrypt roots — so
// on a network-level failure the API client flips to the fallback and we
// remember which base actually works.
const KEY = "concord.serverUrl";
const ACTIVE_KEY = "concord.activeServerUrl";
const BUILD_DEFAULT = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const BUILD_FALLBACK = (import.meta.env.VITE_API_URL_FALLBACK as string | undefined)?.replace(/\/$/, "") ?? "";

/** True when the server URL is fixed at build time (no user override / field). */
export const serverPinned = !!BUILD_DEFAULT;

export function getServerUrl(): string {
  if (serverPinned) {
    // Baked URL wins over stale user overrides, but the primary/fallback
    // choice (made after a connectivity failure) is respected.
    const active = localStorage.getItem(ACTIVE_KEY);
    if (active && (active === BUILD_DEFAULT || active === BUILD_FALLBACK)) return active;
    return BUILD_DEFAULT;
  }
  return localStorage.getItem(KEY) ?? "";
}

/**
 * Flip primary ↔ fallback after a network-level failure. Returns the new base,
 * or null when there's nothing to switch to.
 */
export function switchServerBase(): string | null {
  if (!serverPinned || !BUILD_FALLBACK || BUILD_FALLBACK === BUILD_DEFAULT) return null;
  const next = getServerUrl() === BUILD_DEFAULT ? BUILD_FALLBACK : BUILD_DEFAULT;
  localStorage.setItem(ACTIVE_KEY, next);
  return next;
}

/**
 * The socket and all live subscriptions are bound to the old base — after a
 * successful switch the cleanest recovery is a one-shot app reload on the
 * working base (rate-limited so flapping networks can't reload-loop us).
 */
export function reloadOnceAfterSwitch() {
  const last = Number(localStorage.getItem("concord.baseSwitchReload") || 0);
  if (Date.now() - last < 30_000) return;
  localStorage.setItem("concord.baseSwitchReload", String(Date.now()));
  setTimeout(() => window.location.reload(), 100);
}

export function setServerUrl(url: string): void {
  if (serverPinned) return; // no-op when the URL is baked in
  const clean = url.trim().replace(/\/$/, "");
  if (clean) localStorage.setItem(KEY, clean);
  else localStorage.removeItem(KEY);
}

/** Build a full URL for an API/socket path against the configured server. */
export function serverPath(path: string): string {
  if (/^https?:\/\//i.test(path)) return path; // already absolute (e.g. GIF/embed)
  const base = getServerUrl();
  if (!base) return path; // same-origin (web dev via proxy)
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/** True when running inside the Electron desktop shell. */
export const isDesktop = typeof navigator !== "undefined" && /Electron/i.test(navigator.userAgent);
