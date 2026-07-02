// Android background notifications. The native side (PushService plugin,
// client/android-extras/) runs a foreground service holding an SSE stream to
// the server — no Google FCM. Here we just hand it the server URL and a
// long-lived push token after login, and stop it on logout.
import { registerPlugin } from "@capacitor/core";
import { isAndroidApp } from "./platform";
import { getServerUrl } from "./serverUrl";
import { api } from "../api/client";

interface PushServicePlugin {
  start(opts: { url: string; token: string }): Promise<void>;
  stop(): Promise<void>;
  setSpeakerphone(opts: { on: boolean }): Promise<void>;
  getPendingShare(): Promise<{ text?: string; mimeType?: string; dataB64?: string }>;
  getPendingInvite(): Promise<{ code?: string }>;
  addListener(event: "share", cb: (d: { text?: string; mimeType?: string; dataB64?: string }) => void): Promise<unknown>;
  addListener(event: "invite", cb: (d: { code?: string }) => void): Promise<unknown>;
}

const PushService = registerPlugin<PushServicePlugin>("PushService");

/** Route call audio to the loudspeaker (true) or the earpiece (false). */
export async function setSpeakerphone(on: boolean) {
  if (!isAndroidApp()) return;
  try {
    await PushService.setSpeakerphone({ on });
  } catch {
    /* old APK */
  }
}

export type SharedContent = { text?: string; mimeType?: string; dataB64?: string };

/** Listen for "Share → Concord" content (and pick up anything shared before JS booted). */
export function initShareListener(onShare: (s: SharedContent) => void) {
  if (!isAndroidApp()) return;
  try {
    PushService.addListener("share", (d) => {
      if (d && (d.text || d.dataB64)) onShare(d);
    });
    PushService.getPendingShare()
      .then((d) => {
        if (d && (d.text || d.dataB64)) onShare(d);
      })
      .catch(() => {});
  } catch {
    /* old APK */
  }
}

/** Invite links tapped outside the app open it with a code — join directly. */
export function initInviteListener(onInvite: (code: string) => void) {
  if (!isAndroidApp()) return;
  try {
    PushService.addListener("invite", (d) => {
      if (d?.code) onInvite(d.code);
    });
    PushService.getPendingInvite()
      .then((d) => {
        if (d?.code) onInvite(d.code);
      })
      .catch(() => {});
  } catch {
    /* old APK */
  }
}

/** Decode a shared payload into a File ready for the uploader. */
export function sharedContentToFile(s: SharedContent): File | null {
  if (!s.dataB64) return null;
  const bin = atob(s.dataB64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const mime = s.mimeType || "application/octet-stream";
  const ext = mime.split("/")[1]?.split(";")[0] || "bin";
  return new File([arr], `shared-${Date.now()}.${ext}`, { type: mime });
}

export async function startPushService() {
  if (!isAndroidApp()) return;
  try {
    const { token } = await api<{ token: string }>("/api/push/token", { method: "POST" });
    await PushService.start({ url: getServerUrl(), token });
  } catch (e) {
    // Old APK without the plugin, or the server predates /api/push — fine.
    console.warn("[push] not started:", e);
  }
}

export async function stopPushService() {
  if (!isAndroidApp()) return;
  try {
    await PushService.stop();
  } catch {
    /* plugin absent — nothing to stop */
  }
}
