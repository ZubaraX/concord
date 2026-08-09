import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { isAndroidApp } from "../lib/platform";

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  onClick: () => void;
}

// Context / action menu. On desktop it's a small menu at the cursor; on phones
// (coarse pointer or narrow screen) it slides up as a full-width bottom sheet,
// which is far easier to tap than a menu floating mid-screen.
export default function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Bottom sheet only on real phones — a desktop with a touchscreen also
  // reports pointer:coarse, which used to turn every menu into a bar at the
  // bottom of the screen ("вне чата"). Gate on the Android app or a phone-width
  // window instead.
  const [sheet] = useState(() => typeof window !== "undefined" && (isAndroidApp() || window.innerWidth < 600));

  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const id = setTimeout(() => {
      window.addEventListener("click", close);
      window.addEventListener("contextmenu", close);
    }, 0);
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(id);
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  if (sheet) {
    // Portaled to <body>: ancestor transforms/overflow can't displace it.
    return createPortal(
      <div className="fixed inset-0 z-[85] flex items-end bg-black/40" onClick={onClose} onContextMenu={(e) => e.preventDefault()}>
        <div
          ref={ref}
          onClick={(e) => e.stopPropagation()}
          className="cc-sheet w-full rounded-t-2xl bg-discord-rail p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-2xl ring-1 ring-black/40"
        >
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-discord-faint/50" />
          {items.map((it, i) => (
            <button
              key={i}
              onClick={() => { it.onClick(); onClose(); }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-base ${
                it.danger ? "text-discord-danger active:bg-discord-danger active:text-white" : "text-discord-text active:bg-discord-accent active:text-white"
              }`}
            >
              {it.icon && <span className="flex w-5 justify-center">{it.icon}</span>}
              {it.label}
            </button>
          ))}
        </div>
      </div>,
      document.body
    );
  }

  // Desktop: a compact menu kept fully on-screen near the cursor/anchor.
  const W = 190;
  const H = items.length * 32 + 12;
  const left = Math.max(8, Math.min(x, window.innerWidth - W - 8));
  const top = Math.max(8, Math.min(y, window.innerHeight - H - 8));

  return createPortal(
    <div
      ref={ref}
      style={{ left, top, width: W }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      className="cc-pop fixed z-[85] rounded-md bg-discord-rail p-1 shadow-xl ring-1 ring-black/40"
    >
      {items.map((it, i) => (
        <button
          key={i}
          onClick={() => {
            it.onClick();
            onClose();
          }}
          className={`flex w-full items-center gap-2 rounded px-2 py-1 text-sm ${
            it.danger
              ? "text-discord-danger hover:bg-discord-danger hover:text-white"
              : "text-discord-text hover:bg-discord-accent hover:text-white"
          }`}
        >
          {it.icon && <span className="flex w-4 shrink-0 justify-center">{it.icon}</span>}
          <span className="truncate">{it.label}</span>
        </button>
      ))}
    </div>,
    document.body
  );
}
