// Sync app preferences with the account so they follow you between the
// desktop app, the phone and the web version. Only device-INDEPENDENT keys
// travel: microphone/speaker pickers and the server URL stay local, because
// they mean nothing on another machine.
import { api } from "../api/client";
import { useSettings, type SettingsState } from "../store/settings";

const SYNCED_KEYS = [
  "lang",
  "theme",
  "effects",
  "soundsEnabled",
  "soundVolume",
  "outputVolume",
  "inputVolume",
  "echoCancellation",
  "noiseSuppression",
  "rnnoise",
  "autoGainControl",
  "micSensitivity",
  "voiceMode",
  "pttKey",
  "screenResolution",
  "screenFps",
  "screenAudio",
  "overlayEnabled",
  "overlayCorner",
  "gameActivity",
] as const satisfies readonly (keyof SettingsState)[];

type Synced = Partial<Pick<SettingsState, (typeof SYNCED_KEYS)[number]>>;

function pick(state: SettingsState): Synced {
  const out: Record<string, unknown> = {};
  for (const k of SYNCED_KEYS) out[k] = state[k];
  return out as Synced;
}

let lastPushed = "";
let timer: ReturnType<typeof setTimeout> | null = null;
let ready = false; // don't echo the server's own values back at it

/** Pull the account's settings, then keep pushing local changes (debounced). */
export async function initSettingsSync() {
  try {
    const { settings } = await api<{ settings: Synced | null }>("/api/auth/settings");
    if (settings) {
      // Server wins on first load — that's what "my settings followed me" means.
      const clean: Record<string, unknown> = {};
      for (const k of SYNCED_KEYS) if (settings[k] !== undefined) clean[k] = settings[k];
      useSettings.getState().set(clean as Partial<SettingsState>);
    }
    lastPushed = JSON.stringify(pick(useSettings.getState()));
  } catch {
    /* offline or an older server — keep using local settings */
  } finally {
    ready = true;
  }

  useSettings.subscribe((state) => {
    if (!ready) return;
    const snapshot = JSON.stringify(pick(state));
    if (snapshot === lastPushed) return; // a non-synced key changed
    lastPushed = snapshot;
    if (timer) clearTimeout(timer);
    // Debounced: dragging a volume slider must not spam the server.
    timer = setTimeout(() => {
      api("/api/auth/settings", { method: "PUT", body: JSON.stringify({ settings: JSON.parse(snapshot) }) }).catch(
        () => {}
      );
    }, 1500);
  });
}
