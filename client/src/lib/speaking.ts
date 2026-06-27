import { useEffect, useRef, useState } from "react";

export interface SpeakStream {
  id: string;
  stream: MediaStream;
  enabled?: boolean; // false = muted → never "speaking"
}

// Detects who is currently speaking from a set of audio streams, using Web Audio
// level analysis with a short hold so the indicator doesn't flicker.
export function useSpeaking(streams: SpeakStream[]): Record<string, boolean> {
  const [speaking, setSpeaking] = useState<Record<string, boolean>>({});
  const ctxRef = useRef<AudioContext | null>(null);
  const nodesRef = useRef(
    new Map<
      string,
      { analyser: AnalyserNode; src: MediaStreamAudioSourceNode; data: Uint8Array<ArrayBuffer>; lastSpoke: number }
    >()
  );
  const streamsRef = useRef(streams);
  streamsRef.current = streams;
  const ids = streams.map((s) => s.id).join(",");

  // (Re)build analyser nodes whenever the set of streams changes.
  useEffect(() => {
    if (!ctxRef.current) {
      if (streamsRef.current.length === 0) return; // don't spin up audio until in a call
      try {
        ctxRef.current = new AudioContext();
      } catch {
        return;
      }
    }
    const ctx = ctxRef.current;
    const nodes = nodesRef.current;
    const present = new Set(streamsRef.current.map((s) => s.id));
    for (const [id, n] of nodes) {
      if (!present.has(id)) {
        try {
          n.src.disconnect();
        } catch {
          /* ignore */
        }
        nodes.delete(id);
      }
    }
    for (const s of streamsRef.current) {
      if (nodes.has(s.id)) continue;
      try {
        const src = ctx.createMediaStreamSource(s.stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        src.connect(analyser);
        nodes.set(s.id, { analyser, src, data: new Uint8Array(analyser.frequencyBinCount), lastSpoke: 0 });
      } catch {
        /* a stream with no audio track, etc. */
      }
    }
  }, [ids]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const now = performance.now();
      const enabled = new Map(streamsRef.current.map((s) => [s.id, s.enabled !== false]));
      const next: Record<string, boolean> = {};
      for (const [id, n] of nodesRef.current) {
        n.analyser.getByteTimeDomainData(n.data);
        let peak = 0;
        for (const v of n.data) peak = Math.max(peak, Math.abs(v - 128) / 128);
        if (peak > 0.07 && enabled.get(id) !== false) n.lastSpoke = now;
        next[id] = now - n.lastSpoke < 280; // hold to avoid flicker
      }
      setSpeaking((prev) => {
        const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
        for (const k of keys) if (!!prev[k] !== !!next[k]) return next;
        return prev;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return speaking;
}
