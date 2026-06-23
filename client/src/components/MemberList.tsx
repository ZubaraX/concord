import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { getSocket } from "../lib/socket";
import { useUI } from "../store/ui";
import type { Guild, GuildMember, PresenceStatus } from "../types";
import Avatar from "./Avatar";

export default function MemberList() {
  const { currentGuildId } = useUI();
  const [presence, setPresence] = useState<Record<string, PresenceStatus>>({});

  const { data: guild } = useQuery<Guild>({
    queryKey: ["guild", currentGuildId],
    queryFn: () => api<Guild>(`/api/guilds/${currentGuildId}`),
    enabled: !!currentGuildId,
  });

  // Live presence updates from the gateway.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onPresence = (p: { userId: string; status: PresenceStatus }) =>
      setPresence((prev) => ({ ...prev, [p.userId]: p.status }));
    socket.on("presence:update", onPresence);
    return () => void socket.off("presence:update", onPresence);
  }, []);

  if (!currentGuildId || !guild?.members) return null;

  const withStatus = (m: GuildMember): PresenceStatus =>
    presence[m.user.id] ?? m.user.status ?? "OFFLINE";

  const online = guild.members.filter((m) => withStatus(m) !== "OFFLINE");
  const offline = guild.members.filter((m) => withStatus(m) === "OFFLINE");

  return (
    <aside className="hidden w-60 flex-col bg-discord-sidebar lg:flex">
      <div className="flex-1 overflow-y-auto px-2 py-4">
        <Section title={`Online — ${online.length}`} members={online} status={withStatus} />
        <Section title={`Offline — ${offline.length}`} members={offline} status={withStatus} dim />
      </div>
    </aside>
  );
}

function Section({
  title,
  members,
  status,
  dim,
}: {
  title: string;
  members: GuildMember[];
  status: (m: GuildMember) => PresenceStatus;
  dim?: boolean;
}) {
  if (members.length === 0) return null;
  return (
    <div className="mb-4">
      <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-discord-muted">
        {title}
      </div>
      {members.map((m) => {
        const top = m.roles?.find((r) => !r.isDefault && r.color);
        return (
          <div
            key={m.id}
            className={`flex items-center gap-2 rounded px-2 py-1.5 hover:bg-discord-hover ${dim ? "opacity-50" : ""}`}
          >
            <Avatar user={m.user} size={32} status={status(m)} />
            <span className="truncate text-sm font-medium" style={{ color: top?.color }}>
              {m.nickname ?? m.user.displayName ?? m.user.username}
            </span>
          </div>
        );
      })}
    </div>
  );
}
