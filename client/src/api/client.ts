// Tiny fetch wrapper with bearer auth + transparent refresh-on-401.
import { serverPath } from "../lib/serverUrl";

const ACCESS_KEY = "concord.access";
const REFRESH_KEY = "concord.refresh";

export const tokens = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh?: string) {
    localStorage.setItem(ACCESS_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

async function refreshAccess(): Promise<boolean> {
  const refresh = tokens.refresh;
  if (!refresh) return false;
  const res = await fetch(serverPath("/api/auth/refresh"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: refresh }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  tokens.set(data.accessToken);
  return true;
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
  retry = true
): Promise<T> {
  const headers = new Headers(options.headers);
  // Only declare JSON when we actually send a body — otherwise Fastify rejects
  // an empty body with content-type application/json (400 Bad Request).
  if (options.body) headers.set("Content-Type", "application/json");
  if (tokens.access) headers.set("Authorization", `Bearer ${tokens.access}`);

  const rel = path.startsWith("/") ? path : `/api/${path}`;
  const res = await fetch(serverPath(rel), {
    ...options,
    headers,
  });

  if (res.status === 401 && retry && (await refreshAccess())) {
    return api<T>(path, options, false);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error?.message ?? body.error ?? `Request failed (${res.status})`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface UploadedFile {
  url: string;
  filename: string;
  size: number;
  mimeType: string;
  width?: number | null;
  height?: number | null;
}

/** Upload a single file (no size cap server-side). Returns attachment metadata. */
export async function uploadFile(file: File, retry = true): Promise<UploadedFile> {
  const form = new FormData();
  form.append("file", file);
  const headers = new Headers();
  if (tokens.access) headers.set("Authorization", `Bearer ${tokens.access}`);
  // Note: do NOT set Content-Type; the browser adds the multipart boundary.
  const res = await fetch(serverPath("/api/upload"), { method: "POST", body: form, headers });
  // Same transparent refresh-on-401 as api(): the 15-min access token often
  // expires between sessions, which used to make uploads fail intermittently.
  if (res.status === 401 && retry && (await refreshAccess())) {
    return uploadFile(file, false);
  }
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  return res.json();
}
