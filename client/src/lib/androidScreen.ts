// Android screen share. The WebView has no getDisplayMedia, so the native side
// (ScreenCapPlugin/ScreenCapService, client/android-extras/) captures the
// screen with MediaProjection and streams JPEG frames here; we paint them onto
// a canvas and hand canvas.captureStream() to WebRTC as a normal video track.
import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

interface ScreenCapPlugin {
  start(): Promise<void>;
  stop(): Promise<void>;
  addListener(event: "frame", cb: (d: { b64: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: "stopped", cb: () => void): Promise<PluginListenerHandle>;
}

const ScreenCap = registerPlugin<ScreenCapPlugin>("ScreenCap");

let canvas: HTMLCanvasElement | null = null;
let frameSub: PluginListenerHandle | null = null;
let stopSub: PluginListenerHandle | null = null;

/** Ask for screen capture consent and return a WebRTC-ready MediaStream.
 *  Rejects if the user declines. `onEnded` fires when capture stops natively
 *  (e.g. from the system notification). */
export async function startAndroidScreenStream(onEnded: () => void): Promise<MediaStream> {
  canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext("2d")!;
  const img = new Image();
  let busy = false;

  frameSub = await ScreenCap.addListener("frame", ({ b64 }) => {
    if (busy || !canvas) return;
    busy = true;
    img.onload = () => {
      if (canvas) {
        if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
        }
        ctx.drawImage(img, 0, 0);
      }
      busy = false;
    };
    img.onerror = () => {
      busy = false;
    };
    img.src = "data:image/jpeg;base64," + b64;
  });
  stopSub = await ScreenCap.addListener("stopped", onEnded);

  try {
    await ScreenCap.start(); // system consent dialog
  } catch (e) {
    await cleanup();
    throw e;
  }
  return canvas.captureStream(10);
}

export async function stopAndroidScreenStream() {
  try {
    await ScreenCap.stop();
  } catch {
    /* plugin absent (old APK) */
  }
  await cleanup();
}

async function cleanup() {
  frameSub?.remove();
  stopSub?.remove();
  frameSub = stopSub = null;
  canvas = null;
}
