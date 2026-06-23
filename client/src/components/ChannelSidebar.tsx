import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { api } from "../api/client";
import { useUI } from "../store/ui";
import { useAuth } from "../store/auth";
import type { Channel, Guild } from "../types";
import UserPanel from "./UserPanel";

export default function ChannelSidebar() {
  const { currentGuildId, currentChannelId, setChannel, openModal } = useUI();
  const qc = useQueryClient();

  const { data: guild } = useQuery<Guild>({
    queryKey: ["guild", currentGuildId],
    queryFn: () => api<Guild>(`/api/guilds/${currentGuildId}`),
    enabled: !!currentGuildId,
  });

  const channels = guild?.channels ?? [];

  // Group channels under their category, in position order.
  const grouped = useMemo(() => groupChannels(channels), [channels]);

  // Auto-select the first text channel when a guild opens.
  useEffect(() => {
    if (currentGuildId && !currentChannelId) {
      const firstText = channels.find((c) => c.type === "TEXT");
      if (firstText) setChannel(firstText.id);
    }
  }, [currentGuildId, currentChannelId, channels, setChannel]);

  async function createChannel(type: "TEXT" | "VOICE", parentId?: string) {
    const name = window.prompt(`New ${type.toLowerCase()} channel name?`)?.trim();
    if (!name || !currentGuildId) return;
    await api("/api/channels", {
      method: "POST",
      body: JSON.stringify({ guildId: currentGuildId, name, type, parentId }),
    });
    qc.invalidateQueries({ queryKey: ["guild", currentGuildId] });
  }

  if (!currentGuildId) {
    return (
      <aside className="flex w-60 flex-col bg-discord-sidebar">
        <div className="flex h-12 items-center border-b border-black/20 px-4 font-semibold shadow-sm">
          Direct Messages
        </div>
        <div className="flex-1 p-3 text-sm text-discord-muted">No DMs yet.</div>
        <UserPanel />
      </aside>
    );
  }

  return (
    <aside className="flex w-60 flex-col bg-discord-sidebar">
      <div className="flex h-12 items-center justify-between border-b border-black/20 px-4 font-semibold shadow-sm">
        <span className="truncate">{guild?.name ?? "…"}</span>
        <button
          onClick={() => openModal("invite")}
          title="Invite People"
          className="rounded p-1 text-discord-muted transition hover:bg-discord-hover hover:text-white"
        >
          {/* person-plus glyph */}
          <span className="text-base">＋👤</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3">
        {grouped.map((group) => (
          <div key={group.category?.id ?? "uncategorized"} className="mb-4">
            {group.category && (
              <div className="group flex items-center justify-between px-1 pb-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-discord-muted">
                  {group.category.name}
                </span>
                <button
                  onClick={() =>
                    createChannel(
                      group.category!.name.toLowerCase().includes("voice") ? "VOICE" : "TEXT",
                      group.category!.id
                    )
                  }
                  className="text-discord-muted opacity-0 transition group-hover:opacity-100 hover:text-white"
                  title="Create channel"
                >
                  +
                </button>
              </div>
            )}
            {group.channels.map((c) => (
              <ChannelRow
                key={c.id}
                channel={c}
                active={currentChannelId === c.id}
                onClick={() => c.type === "TEXT" && setChannel(c.id)}
              />
            ))}
          </div>
        ))}

        <button
          onClick={() => createChannel("TEXT")}
          className="mt-2 w-full rounded px-2 py-1 text-left text-sm text-discord-muted hover:bg-discord-hover hover:text-white"
        >
          + Create channel
        </button>
      </div>

      <UserPanel />
    </aside>
  );
}

function ChannelRow({
  channel,
  active,
  onClick,
}: {
  channel: Channel;
  active: boolean;
  onClick: () => void;
}) {
  const icon = channel.type === "VOICE" ? "🔊" : channel.type === "ANNOUNCEMENT" ? "📢" : "#";
  return (
    <button
      onClick={onClick}
      className={clsx(
        "mt-0.5 flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-sm transition",
        active
          ? "bg-discord-active text-white"
          : "text-discord-muted hover:bg-discord-hover hover:text-discord-text"
      )}
    >
      <span className="w-4 text-center text-discord-faint">{icon}</span>
      <span className="truncate">{channel.name}</span>
    </button>
  );
}

interface ChannelGroup {
  category: Channel | null;
  channels: Channel[];
}

function groupChannels(channels: Channel[]): ChannelGroup[] {
  const sorted = [...channels].sort((a, b) => a.position - b.position);
  const categories = sorted.filter((c) => c.type === "CATEGORY");
  const groups: ChannelGroup[] = [];

  const uncategorized = sorted.filter((c) => c.type !== "CATEGORY" && !c.parentId);
  if (uncategorized.length) groups.push({ category: null, channels: uncategorized });

  for (const cat of categories) {
    groups.push({
      category: cat,
      channels: sorted.filter((c) => c.parentId === cat.id),
    });
  }
  return groups;
}
