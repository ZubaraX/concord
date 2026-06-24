// Lightweight notification sounds (synthesized, no asset files) + desktop
// notifications (works in Electron and browsers that grant permission).
let ctx: AudioContext | null = null;

function beep(freq: number, start: number, dur = 0.18, vol = 0.18) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.connect(g);
  g.connect(ctx.destination);
  o.type = "sine";
  o.frequency.value = freq;
  const t = ctx.currentTime + start;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export function playPing() {
  try {
    ctx = ctx ?? new AudioContext();
    ctx.resume();
    beep(880, 0);
  } catch {
    /* ignore */
  }
}

export function playRing() {
  try {
    ctx = ctx ?? new AudioContext();
    ctx.resume();
    beep(660, 0);
    beep(880, 0.22);
  } catch {
    /* ignore */
  }
}

// Looping ring for incoming calls. Returns a stop function.
export function startRing(): () => void {
  playRing();
  const iv = setInterval(playRing, 2500);
  return () => clearInterval(iv);
}

export function desktopNotify(title: string, body?: string) {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") {
      new Notification(title, { body });
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then((p) => {
        if (p === "granted") new Notification(title, { body });
      });
    }
  } catch {
    /* ignore */
  }
}

/** Ask for desktop-notification permission up front (call after login). */
export function requestNotifyPermission() {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
  } catch {
    /* ignore */
  }
}
