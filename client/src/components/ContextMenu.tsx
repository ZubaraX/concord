import { useEffect, useRef } from "react";

export interface MenuItem {
  label: string;
  icon?: string;
  danger?: boolean;
  onClick: () => void;
}

// A right-click menu positioned at the cursor. Closes on outside click / Esc.
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

  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Keep the menu on-screen.
  const left = Math.min(x, window.innerWidth - 220);
  const top = Math.min(y, window.innerHeight - items.length * 36 - 16);

  return (
    <div
      ref={ref}
      style={{ left, top }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-[70] w-52 rounded-md bg-discord-rail p-1.5 shadow-xl ring-1 ring-black/40"
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
          {it.icon && <span className="w-4 text-center">{it.icon}</span>}
          {it.label}
        </button>
      ))}
    </div>
  );
}
