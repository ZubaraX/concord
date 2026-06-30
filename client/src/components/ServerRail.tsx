import clsx from "clsx";
import { useUI } from "../store/ui";
import { PlusIcon, UsersIcon } from "./Icons";
import type { Guild } from "../types";

// The 72px server rail: round guild icons, add-server, home.
export default function ServerRail({ guilds }: { guilds: Guild[] }) {
  const { currentGuildId, setGuild, openModal } = useUI();

  return (
    <nav className="flex w-[72px] flex-col items-center gap-2 bg-discord-rail py-3">
      <RailButton label="Friends & Direct Messages" active={!currentGuildId} onClick={() => setGuild(null)}>
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
          >
            {g.iconUrl ? (
              <img src={g.iconUrl} alt={g.name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-sm font-semibold">{initials(g.name)}</span>
            )}
          </RailButton>
        ))}
      </div>

      <RailButton label="Add or Join a Server" onClick={() => openModal("addServer")} accent>
        <span className="text-discord-green group-hover:text-white"><PlusIcon size={24} /></span>
      </RailButton>
    </nav>
  );
}

function RailButton({
  children,
  label,
  active,
  accent,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  active?: boolean;
  accent?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "cc-lift group relative flex h-12 w-12 items-center justify-center overflow-hidden bg-discord-card text-discord-text transition-all duration-200",
        active ? "rounded-2xl bg-discord-accent text-white" : "rounded-3xl hover:rounded-2xl",
        accent ? "hover:bg-discord-green hover:text-white" : "hover:bg-discord-accent hover:text-white"
      )}
    >
      <span
        className={clsx(
          "absolute -left-3 w-1 rounded-r bg-white transition-all",
          active ? "h-10" : "h-0 group-hover:h-5"
        )}
      />
      {children}
    </button>
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
