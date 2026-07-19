import { useEffect, useRef, useState } from "react";
import { useLightbox } from "../store/lightbox";
import { useI18n } from "../lib/i18n";
import { DownloadIcon, ExternalLinkIcon, XIcon } from "./Icons";

// Full-screen in-app image viewer with real pan/zoom:
//  • mouse wheel zooms toward the cursor (not the center)
//  • drag to pan while zoomed
//  • pinch-to-zoom on touch, double-click/tap zooms into that spot
// Esc or clicking the backdrop closes.
export default function Lightbox() {
  const { src, alt, close } = useLightbox();
  const { t } = useI18n();

  // Transform model: image centered in the container, then
  // translate(x, y) scale(s) around the container center.
  const [tf, setTf] = useState({ s: 1, x: 0, y: 0 });
  const [interacting, setInteracting] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  useEffect(() => {
    setTf({ s: 1, x: 0, y: 0 });
    pointers.current.clear();
    if (!src) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [src, close]);

  if (!src) return null;

  const filename = alt || src.split("/").pop() || "image";

  // Keep the scale sane and the image reachable (edges clamped with slack).
  function clampTf(next: { s: number; x: number; y: number }) {
    const s = Math.min(8, Math.max(1, next.s));
    const wrap = wrapRef.current;
    const img = imgRef.current;
    if (!wrap || !img || s <= 1.001) return { s: 1, x: 0, y: 0 };
    const maxX = Math.max(0, (img.offsetWidth * s - wrap.clientWidth) / 2) + 48;
    const maxY = Math.max(0, (img.offsetHeight * s - wrap.clientHeight) / 2) + 48;
    return { s, x: Math.max(-maxX, Math.min(maxX, next.x)), y: Math.max(-maxY, Math.min(maxY, next.y)) };
  }

  // Zoom keeping the screen point (clientX/Y) fixed: t' = p − k·(p − t).
  function zoomAt(clientX: number, clientY: number, factor: number, targetS?: number) {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const r = wrap.getBoundingClientRect();
    const px = clientX - r.left - r.width / 2;
    const py = clientY - r.top - r.height / 2;
    setTf((cur) => {
      const s2 = Math.min(8, Math.max(1, targetS ?? cur.s * factor));
      const k = s2 / cur.s;
      return clampTf({ s: s2, x: px - k * (px - cur.x), y: py - k * (py - cur.y) });
    });
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setInteracting(true);
  }
  function onPointerMove(e: React.PointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const pts = pointers.current;
    if (pts.size === 1) {
      // Drag-to-pan (only useful when zoomed).
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      setTf((cur) => (cur.s > 1 ? clampTf({ ...cur, x: cur.x + dx, y: cur.y + dy }) : cur));
    } else if (pts.size === 2) {
      // Pinch: zoom by the distance ratio around the midpoint, pan by its drift.
      const [a0, b0] = [...pts.values()];
      const other = [...pts.entries()].find(([id]) => id !== e.pointerId)?.[1] ?? a0;
      const oldDist = Math.hypot(a0.x - b0.x, a0.y - b0.y) || 1;
      const oldMid = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const newDist = Math.hypot(e.clientX - other.x, e.clientY - other.y) || 1;
      const newMid = { x: (e.clientX + other.x) / 2, y: (e.clientY + other.y) / 2 };
      const wrap = wrapRef.current;
      if (!wrap) return;
      const r = wrap.getBoundingClientRect();
      const px = newMid.x - r.left - r.width / 2;
      const py = newMid.y - r.top - r.height / 2;
      setTf((cur) => {
        const s2 = Math.min(8, Math.max(1, cur.s * (newDist / oldDist)));
        const k = s2 / cur.s;
        return clampTf({
          s: s2,
          x: px - k * (px - cur.x) + (newMid.x - oldMid.x),
          y: py - k * (py - cur.y) + (newMid.y - oldMid.y),
        });
      });
    }
  }
  function onPointerEnd(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) setInteracting(false);
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/85 backdrop-blur-sm" onClick={close}>
      {/* Top bar */}
      <div
        className="flex items-center justify-between gap-3 px-4 py-3 text-discord-text"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="min-w-0 truncate text-sm text-discord-muted">{filename}</span>
        <div className="flex shrink-0 items-center gap-2">
          {tf.s > 1 && (
            <button
              onClick={() => setTf({ s: 1, x: 0, y: 0 })}
              className="rounded bg-white/10 px-3 py-1.5 text-xs tabular-nums hover:bg-white/20"
            >
              {Math.round(tf.s * 100)}% ↺
            </button>
          )}
          <a
            href={src}
            download={filename}
            className="flex items-center gap-1.5 rounded bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20"
            onClick={(e) => e.stopPropagation()}
          >
            <DownloadIcon size={14} /> {t("common.download")}
          </a>
          <button
            onClick={() => window.open(src, "_blank")}
            className="flex items-center gap-1.5 rounded bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20"
          >
            <ExternalLinkIcon size={14} /> {t("common.openInBrowser")}
          </button>
          <button
            onClick={close}
            className="flex items-center rounded bg-white/10 px-2.5 py-1.5 text-xs hover:bg-white/20"
            aria-label="Close"
          >
            <XIcon size={15} />
          </button>
        </div>
      </div>

      {/* Image area: wheel-zoom to cursor, drag-pan, pinch, double-click. */}
      <div
        ref={wrapRef}
        className="flex flex-1 touch-none items-center justify-center overflow-hidden p-4"
        onWheel={(e) => zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.25 : 1 / 1.25)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <img
          ref={imgRef}
          src={src}
          alt={filename}
          draggable={false}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (tf.s > 1) setTf({ s: 1, x: 0, y: 0 });
            else zoomAt(e.clientX, e.clientY, 1, 2.5);
          }}
          style={{
            transform: `translate(${tf.x}px, ${tf.y}px) scale(${tf.s})`,
            transition: interacting ? "none" : "transform 0.12s ease-out",
          }}
          className={`max-h-full max-w-full select-none object-contain ${
            tf.s > 1 ? (interacting ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in"
          }`}
        />
      </div>
    </div>
  );
}
