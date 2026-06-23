// The server may live anywhere (Codespaces forwarded URL, a LAN box, etc.),
// so the desktop/web client lets the user configure it. Persisted in
// localStorage; defaults to VITE_API_URL at build time, else same-origin
// (which works in web dev thanks to the Vite proxy).
const KEY = "concord.serverUrl";
const BUILD_DEFAULT = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export function getServerUrl(): string {
  return localStorage.getItem(KEY) ?? BUILD_DEFAULT;
}

export function setServerUrl(url: string): void {
  const clean = url.trim().replace(/\/$/, "");
  if (clean) localStorage.setItem(KEY, clean);
  else localStorage.removeItem(KEY);
}

/** Build a full URL for an API/socket path against the configured server. */
export function serverPath(path: string): string {
  const base = getServerUrl();
  if (!base) return path; // same-origin (web dev via proxy)
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/** True when running inside the Electron desktop shell. */
export const isDesktop = typeof navigator !== "undefined" && /Electron/i.test(navigator.userAgent);
