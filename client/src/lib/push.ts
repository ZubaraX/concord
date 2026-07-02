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
}

const PushService = registerPlugin<PushServicePlugin>("PushService");

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
