import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { useI18n, type TKey } from "../lib/i18n";

interface Gif {
  id: string;
  url: string;
  preview: string;
}

// Browse categories shown when the search box is empty. `term` is the English
// search query sent to KLIPY; the label is localized.
const CATEGORIES: { emoji: string; term: string; key: TKey }[] = [
  { emoji: "😂", term: "laugh", key: "gifcat.laugh" },
  { emoji: "😍", term: "love", key: "gifcat.love" },
  { emoji: "😢", term: "sad", key: "gifcat.sad" },
  { emoji: "😠", term: "angry", key: "gifcat.angry" },
  { emoji: "😮", term: "wow", key: "gifcat.wow" },
  { emoji: "💃", term: "dance", key: "gifcat.dance" },
  { emoji: "🎉", term: "celebrate", key: "gifcat.celebrate" },
  { emoji: "🤔", term: "thinking", key: "gifcat.thinking" },
  { emoji: "🔥", term: "fire", key: "gifcat.fire" },
  { emoji: "🥰", term: "cute", key: "gifcat.cute" },
  { emoji: "🤦", term: "facepalm", key: "gifcat.facepalm" },
  { emoji: "🥳", term: "party", key: "gifcat.party" },
];

// GIF search popover (KLIPY via the server proxy) with category browsing and
// infinite scroll. Picking one sends it.
export default function GifPicker({ onPick, onClose }: { onPick: (url: string) => void; onClose: () => void }) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [gifs, setGifs] = useState<Gif[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);

  const ref = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const busy = useRef(false);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [onClose]);

  const fetchPage = useCallback(async (query: string, pg: number, append: boolean) => {
    if (busy.current) return;
    busy.current = true;
    if (!append) setLoading(true);
    try {
      const r = await api<{ results: Gif[]; hasNext?: boolean }>(
        `/api/gifs/search?q=${encodeURIComponent(query)}&page=${pg}`
      );
      setGifs((prev) => (append ? [...prev, ...r.results] : r.results));
      setHasNext(!!r.hasNext);
      setPage(pg);
    } catch {
      if (!append) setGifs([]);
      setHasNext(false);
    } finally {
      setLoading(false);
      busy.current = false;
    }
  }, []);

  // Debounced (re)search whenever the query changes → reset to page 1.
  useEffect(() => {
    const id = setTimeout(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      fetchPage(q.trim(), 1, false);
    }, 300);
    return () => clearTimeout(id);
  }, [q, fetchPage]);

  // Infinite scroll: load the next page when the sentinel nears the viewport.
  useEffect(() => {
    const el = sentinel.current;
    const root = scrollRef.current;
    if (!el || !root) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNext && !busy.current) {
          fetchPage(q.trim(), page + 1, true);
        }
      },
      { root, rootMargin: "300px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNext, page, q, fetchPage]);

  const showCategories = !q.trim();

  return (
    <div
      ref={ref}
      className="cc-pop absolute bottom-12 right-0 z-50 flex h-[30rem] max-h-[70vh] w-[26rem] max-w-[calc(100vw-1.5rem)] flex-col rounded-lg bg-discord-rail p-3 shadow-xl ring-1 ring-black/40"
    >
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("gif.search")}
        className="mb-2 w-full rounded bg-discord-deep px-3 py-2 text-sm text-discord-text outline-none focus:ring-1 focus:ring-discord-accent"
      />

      {showCategories && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c.term}
              onClick={() => setQ(c.term)}
              className="rounded-full bg-discord-card px-2.5 py-1 text-xs text-discord-text transition hover:bg-discord-hover"
            >
              {c.emoji} {t(c.key)}
            </button>
          ))}
        </div>
      )}

      <div
        ref={scrollRef}
        className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 content-start gap-3 overflow-y-auto pr-1"
      >
        {loading && gifs.length === 0 && (
          <div className="col-span-2 p-4 text-center text-sm text-discord-muted">{t("gif.loading")}</div>
        )}
        {!loading && gifs.length === 0 && (
          <div className="col-span-2 p-4 text-center text-sm text-discord-muted">{t("gif.noResults")}</div>
        )}
        {gifs.map((g, i) => (
          <button
            key={`${g.id}-${i}`}
            onClick={() => onPick(g.url)}
            className="overflow-hidden rounded-md bg-black/20 ring-1 ring-transparent transition hover:ring-2 hover:ring-discord-accent"
          >
            <img src={g.preview} alt="" className="h-32 w-full object-cover" loading="lazy" />
          </button>
        ))}
        <div ref={sentinel} className="col-span-2 h-1" />
        {hasNext && gifs.length > 0 && (
          <div className="col-span-2 py-2 text-center text-xs text-discord-faint">{t("gif.loading")}</div>
        )}
      </div>
    </div>
  );
}
