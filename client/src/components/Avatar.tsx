import clsx from "clsx";
import type { PresenceStatus, User } from "../types";

const statusColor: Record<PresenceStatus, string> = {
  ONLINE: "bg-discord-green",
  IDLE: "bg-yellow-500",
  DND: "bg-discord-danger",
  OFFLINE: "bg-discord-faint",
};

export default function Avatar({
  user,
  size = 40,
  status,
}: {
  user: Pick<User, "username" | "displayName" | "avatarUrl">;
  size?: number;
  status?: PresenceStatus;
}) {
  const label = (user.displayName ?? user.username ?? "?").slice(0, 1).toUpperCase();
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {user.avatarUrl ? (
        <img src={user.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center rounded-full bg-discord-accent font-semibold text-white"
          style={{ fontSize: size * 0.4 }}
        >
          {label}
        </div>
      )}
      {status && (
        <span
          className={clsx(
            "absolute -bottom-0.5 -right-0.5 rounded-full border-[3px] border-discord-rail",
            statusColor[status]
          )}
          style={{ width: size * 0.35, height: size * 0.35 }}
        />
      )}
    </div>
  );
}
