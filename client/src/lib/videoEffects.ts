// Camera background effects (blur), the same idea Discord ships natively:
// a selfie-segmentation model produces a person mask per frame, we composite
// the sharp person over a blurred copy of the frame on a canvas, and send the
// canvas as the outgoing video track.
//
// The model + wasm are NOT bundled into the apps (≈6 MB) — the server serves
// them from node_modules at /mediapipe/*, so the desktop/Android builds stay
// small and every platform loads the same files over https on first use.
import { SelfieSegmentation, type Results } from "@mediapipe/selfie_segmentation";
import { serverPath } from "./serverUrl";

export interface EffectHandle {
  track: MediaStreamTrack;
  dispose: () => void;
}

const FPS = 24;

export async function createBlurredCameraTrack(input: MediaStreamTrack, blurPx = 12): Promise<EffectHandle> {
  const settings = input.getSettings();
  const w = settings.width ?? 640;
  const h = settings.height ?? 480;

  // Hidden <video> as the sampling source for the model and the canvas.
  const video = document.createElement("video");
  video.srcObject = new MediaStream([input]);
  video.muted = true;
  video.playsInline = true;
  await video.play().catch(() => {});

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");

  const seg = new SelfieSegmentation({ locateFile: (file) => serverPath(`/mediapipe/${file}`) });
  seg.setOptions({ modelSelection: 1 }); // 1 = landscape model, faster
  seg.onResults((res: Results) => {
    if (!res.segmentationMask) return;
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    // person = mask ∩ frame …
    ctx.drawImage(res.segmentationMask, 0, 0, w, h);
    ctx.globalCompositeOperation = "source-in";
    ctx.drawImage(res.image, 0, 0, w, h);
    // … over a blurred copy of the same frame.
    ctx.globalCompositeOperation = "destination-over";
    ctx.filter = `blur(${blurPx}px)`;
    ctx.drawImage(res.image, 0, 0, w, h);
    ctx.restore();
  });

  // Warm the model up before anyone sees the stream.
  await seg.initialize().catch(() => {});

  let stopped = false;
  let busy = false;
  const timer = setInterval(() => {
    if (stopped || busy || video.readyState < 2) return;
    busy = true;
    seg.send({ image: video }).catch(() => {}).finally(() => { busy = false; });
  }, Math.round(1000 / FPS));

  const stream = canvas.captureStream(FPS);
  const track = stream.getVideoTracks()[0];

  return {
    track,
    dispose: () => {
      stopped = true;
      clearInterval(timer);
      try { track.stop(); } catch { /* already stopped */ }
      try { video.pause(); video.srcObject = null; } catch { /* gone */ }
      void seg.close().catch(() => {});
    },
  };
}
