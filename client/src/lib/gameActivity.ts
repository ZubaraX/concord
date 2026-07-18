// "Играет в …" (desktop only): the Electron main process scans running
// processes against a known-games list and pushes the current title here.
// We mirror it into the user's custom status, which already syncs to the
// member list and profile everywhere (user:update broadcast).
import { useAuth } from "../store/auth";
import { useSettings } from "../store/settings";

const PREFIX = "🎮 Играет в ";

export function initGameActivity() {
  const bridge = window.concord;
  if (!bridge?.onGameActivity) return; // web / Android / old desktop build

  bridge.onGameActivity(async (game) => {
    if (!useSettings.getState().gameActivity) return;
    const auth = useAuth.getState();
    if (!auth.user) return;
    const current = auth.user.customStatus ?? "";
    // Never stomp a status the user typed themselves — only manage our own.
    if (current && !current.startsWith(PREFIX)) return;
    const next = game ? PREFIX + game : "";
    if (current === next) return;
    try {
      await auth.updateProfile({ customStatus: next || null });
    } catch {
      /* offline — the next scan will retry */
    }
  });
}
