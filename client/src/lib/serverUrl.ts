// Server location. When a build-time server URL is baked in (VITE_API_URL),
// it is authoritative and any saved override is ignored — so shipped builds
// always talk to the real server. Without a baked URL (e.g. web dev), fall
// back to a saved value or same-origin (Vite proxy).
const KEY = "concord.serverUrl";
const BUILD_DEFAULT = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

/** True when the server URL is fixed at build time (no user override / field). */
export const serverPinned = !!BUILD_DEFAULT;

export function getServerUrl(): string {
  if (serverPinned) return BUILD_DEFAULT; // baked URL wins, ignore stale localStorage
  return localStorage.getItem(KEY) ?? "";
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
