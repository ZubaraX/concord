import { useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { useUI } from "../store/ui";
import { PlusIcon, UsersIcon } from "./Icons";
import type { Guild } from "../types";

// The 72px server rail: round guild icons, add-server, home.
export default function ServerRail({ guilds }: { guilds: Guild[] }) {
  const { currentGuildId, setGuild, openModal } = useUI();
  // Discord-style tooltip. Rendered fixed via a portal because the guild list
  // scrolls — an in-flow tooltip would be clipped by the scroll container.
  const [tip, setTip] = useState<{ label: string; y: number; x: number } | null>(null);

  const hover = {
    onEnter: (e: React.MouseEvent, label: string) => {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setTip({ label, y: r.top + r.height / 2, x: r.right + 12 });
    },
    onLeave: () => setTip(null),
  };

  return (
    <nav className="flex w-[72px] flex-col items-center gap-2 bg-discord-rail py-3">
      <RailButton label="Friends & Direct Messages" active={!currentGuildId} onClick={() => setGuild(null)} hover={hover}>
        <UsersIcon size={26} />
      </RailButton>

      <div className="my-1 h-0.5 w-8 rounded bg-discord-card" />

      <div className="flex flex-1 flex-col items-center gap-2 overflow-y-auto">
        {guilds.map((g) => (
          <RailButton
            key={g.id}
            label={g.name}
            active={currentGuildId === g.id}
            onClick={() => setGuild(g.id)}
            hover={hover}
          >
            {g.iconUrl ? (
              <img src={g.iconUrl} alt={g.name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-sm font-semibold">{initials(g.name)}</span>
            )}
          </RailButton>
        ))}
      </div>

      <RailButton label="Add or Join a Server" onClick={() => openModal("addServer")} accent hover={hover}>
        <span className="text-discord-green group-hover:text-white"><PlusIcon size={24} /></span>
      </RailButton>

      {tip &&
        createPortal(
          <div
            style={{ top: tip.y, left: tip.x }}
            className="pointer-events-none fixed z-[70] hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-black px-2.5 py-1.5 text-sm font-semibold text-white shadow-xl md:block"
          >
            {tip.label}
            <span className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 bg-black" />
          </div>,
          document.body
        )}
    </nav>
  );
}

interface HoverHandlers {
  onEnter: (e: React.MouseEvent, label: string) => void;
  onLeave: () => void;
}

function RailButton({
  children,
  label,
  active,
  accent,
  disabled,
  onClick,
  hover,
}: {
  children: React.ReactNode;
  label: string;
  active?: boolean;
  accent?: boolean;
  disabled?: boolean;
  onClick: () => void;
  hover: HoverHandlers;
}) {
  return (
    <div className="group relative flex items-center justify-center">
      {/* Left pill: tall when active, a short nub on hover — like Discord. */}
      <span
        className={clsx(
          "absolute -left-2 w-1 rounded-r-full bg-white transition-all duration-200",
          active ? "h-10" : "h-0 group-hover:h-5"
        )}
      />
      <button
        disabled={disabled}
        onClick={onClick}
        aria-label={label}
        onMouseEnter={(e) => hover.onEnter(e, label)}
        onMouseLeave={hover.onLeave}
        className={clsx(
          "cc-lift relative flex h-12 w-12 items-center justify-center overflow-hidden bg-discord-card text-discord-text transition-all duration-200",
          active ? "rounded-2xl bg-discord-accent text-white" : "rounded-3xl hover:rounded-2xl",
          accent ? "hover:bg-discord-green hover:text-white" : "hover:bg-discord-accent hover:text-white"
        )}
      >
        {children}
      </button>
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
