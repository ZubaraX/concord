// RNNoise (neural-net WASM) noise suppression for the outgoing mic.
// Inserted between getUserMedia and the WebRTC senders:
//   raw mic track → AudioContext(48kHz) → RnnoiseWorkletNode → destination track
//
// The wasm is inlined as a data URI and the worklet loads from a Blob URL —
// deliberately: the desktop app runs from file://, where fetch() of bundled
// assets is blocked by Chromium, which made the first release of this feature
// silently fall back to the raw mic ("RNNoise не работает").
import { RnnoiseWorkletNode } from "@sapphi-red/web-noise-suppressor";
import rnnoiseWasmDataUri from "@sapphi-red/web-noise-suppressor/rnnoise.wasm?inline";
import workletCode from "@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?raw";

let wasmBinary: ArrayBuffer | null = null; // decoded once, reused across calls
let workletUrl: string | null = null; // blob: URL, created once

function decodeDataUri(uri: string): ArrayBuffer {
  const b64 = uri.slice(uri.indexOf(",") + 1);
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

export async function createRnnoiseTrack(
  raw: MediaStreamTrack
): Promise<{ track: MediaStreamTrack; dispose: () => void }> {
  // RNNoise operates on 48 kHz frames — force the context rate to match.
  const ctx = new AudioContext({ sampleRate: 48000 });
  try {
    wasmBinary ??= decodeDataUri(rnnoiseWasmDataUri);
    workletUrl ??= URL.createObjectURL(new Blob([workletCode], { type: "text/javascript" }));
    await ctx.audioWorklet.addModule(workletUrl);
    const src = ctx.createMediaStreamSource(new MediaStream([raw]));
    const node = new RnnoiseWorkletNode(ctx, { wasmBinary, maxChannels: 2 });
    const dst = ctx.createMediaStreamDestination();
    src.connect(node);
    node.connect(dst);
    void ctx.resume(); // some browsers start suspended without a user gesture
    return {
      track: dst.stream.getAudioTracks()[0],
      dispose: () => {
        try { node.destroy(); } catch { /* already gone */ }
        try { node.disconnect(); src.disconnect(); } catch { /* already gone */ }
        void ctx.close();
      },
    };
  } catch (e) {
    void ctx.close();
    throw e;
  }
}
