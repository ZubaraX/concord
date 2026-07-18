// RNNoise (neural-net WASM) noise suppression for the outgoing mic.
// Inserted between getUserMedia and the WebRTC senders:
//   raw mic track → AudioContext(48kHz) → RnnoiseWorkletNode → destination track
// This module is imported dynamically from voice.ts only when the setting is
// on, so the worklet + wasm live in their own lazy chunk.
import { loadRnnoise, RnnoiseWorkletNode } from "@sapphi-red/web-noise-suppressor";
import rnnoiseWasmPath from "@sapphi-red/web-noise-suppressor/rnnoise.wasm?url";
import rnnoiseWasmSimdPath from "@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url";
import rnnoiseWorkletPath from "@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url";

let wasmBinary: ArrayBuffer | null = null; // fetched once, reused across calls

export async function createRnnoiseTrack(
  raw: MediaStreamTrack
): Promise<{ track: MediaStreamTrack; dispose: () => void }> {
  // RNNoise operates on 48 kHz frames — force the context rate to match.
  const ctx = new AudioContext({ sampleRate: 48000 });
  try {
    wasmBinary ??= await loadRnnoise({ url: rnnoiseWasmPath, simdUrl: rnnoiseWasmSimdPath });
    await ctx.audioWorklet.addModule(rnnoiseWorkletPath);
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
