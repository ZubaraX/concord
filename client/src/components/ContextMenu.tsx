import { useEffect, useRef, useState, type ReactNode } from "react";

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
  const [sheet] = useState(
    () => typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches || window.innerWidth < 640)
  );

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
    return (
      <div className="fixed inset-0 z-[70] flex items-end bg-black/40" onClick={onClose} onContextMenu={(e) => e.preventDefault()}>
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
      </div>
    );
  }

  // Desktop: keep the menu on-screen near the cursor.
  const left = Math.min(x, window.innerWidth - 220);
  const top = Math.min(y, window.innerHeight - items.length * 36 - 16);

  return (
    <div
      ref={ref}
      style={{ left, top }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      className="cc-pop fixed z-[70] w-52 rounded-md bg-discord-rail p-1.5 shadow-xl ring-1 ring-black/40"
    >
      {items.map((it, i) => (
        <button
          key={i}
          onClick={() => {
            it.onClick();
            onClose();
          }}
          className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm ${
            it.danger
              ? "text-discord-danger hover:bg-discord-danger hover:text-white"
              : "text-discord-text hover:bg-discord-accent hover:text-white"
          }`}
        >
          {it.icon && <span className="flex w-4 justify-center">{it.icon}</span>}
          {it.label}
        </button>
      ))}
    </div>
  );
}
