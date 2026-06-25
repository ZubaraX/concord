import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";

interface Gif {
  id: string;
  url: string;
  preview: string;
}

// GIF search popover (KLIPY via the server proxy). Picking one sends it.
export default function GifPicker({ onPick, onClose }: { onPick: (url: string) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [gifs, setGifs] = useState<Gif[]>([]);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [onClose]);

  // Debounced search (trending when empty).
  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      api<{ results: Gif[] }>(`/api/gifs/search?q=${encodeURIComponent(q)}`)
        .then((r) => setGifs(r.results))
        .catch(() => setGifs([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div ref={ref} className="absolute bottom-12 right-0 z-50 flex h-[30rem] w-[26rem] flex-col rounded-lg bg-discord-rail p-3 shadow-xl ring-1 ring-black/40">
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search GIFs…"
        className="mb-3 w-full rounded bg-[#1e1f22] px-3 py-2 text-sm text-discord-text outline-none focus:ring-1 focus:ring-discord-accent"
      />
      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 content-start gap-3 overflow-y-auto pr-1">
        {loading && <div className="col-span-2 p-4 text-center text-sm text-discord-muted">Loading…</div>}
        {!loading && gifs.length === 0 && (
          <div className="col-span-2 p-4 text-center text-sm text-discord-muted">No GIFs found.</div>
        )}
        {gifs.map((g) => (
          <button
            key={g.id}
            onClick={() => onPick(g.url)}
            className="overflow-hidden rounded-md bg-black/20 ring-1 ring-transparent transition hover:ring-2 hover:ring-discord-accent"
          >
            <img src={g.preview} alt="" className="h-32 w-full object-cover" loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  );
}
