import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { api } from "../api/client";
import { useUI } from "../store/ui";
import { useVoice } from "../store/voice";
import { joinVoice, leaveVoice, toggleMute, toggleScreen } from "../lib/voice";
import type { Channel, Guild } from "../types";
import UserPanel from "./UserPanel";

export default function ChannelSidebar() {
  const { currentGuildId, currentChannelId, setChannel, openModal } = useUI();
  const voice = useVoice();
  const qc = useQueryClient();

  const { data: guild } = useQuery<Guild>({
    queryKey: ["guild", currentGuildId],
    queryFn: () => api<Guild>(`/api/guilds/${currentGuildId}`),
    enabled: !!currentGuildId,
  });

  const channels = guild?.channels ?? [];
  const grouped = useMemo(() => groupChannels(channels), [channels]);

  // userId -> display name, for voice occupancy labels.
  const nameOf = useMemo(() => {
    const m: Record<string, string> = {};
    for (const mem of guild?.members ?? []) {
      m[mem.user.id] = mem.nickname ?? mem.user.displayName ?? mem.user.username;
    }
    return m;
  }, [guild?.members]);

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
          className="rounded px-1.5 py-1 text-sm text-discord-muted transition hover:bg-discord-hover hover:text-white"
        >
          Invite
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
              <div key={c.id}>
                <ChannelRow
                  channel={c}
                  active={c.type === "VOICE" ? voice.channelId === c.id : currentChannelId === c.id}
                  onClick={() => (c.type === "VOICE" ? joinVoice(c.id) : c.type === "TEXT" && setChannel(c.id))}
                />
                {c.type === "VOICE" &&
                  (voice.occupancy[c.id] ?? []).map((uid) => (
                    <div key={uid} className="ml-9 flex items-center gap-1.5 py-0.5 text-sm text-discord-muted">
                      <span className="h-2 w-2 rounded-full bg-discord-green" />
                      <span className="truncate">{nameOf[uid] ?? "Someone"}</span>
                    </div>
                  ))}
              </div>
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

      {voice.channelId && (
        <VoiceControlBar
          channelName={channels.find((c) => c.id === voice.channelId)?.name ?? "Voice"}
          muted={voice.muted}
          screenOn={voice.screenOn}
          onMute={toggleMute}
          onScreen={toggleScreen}
          onLeave={leaveVoice}
        />
      )}
      <UserPanel />
    </aside>
  );
}

function VoiceControlBar({
  channelName,
  muted,
  screenOn,
  onMute,
  onScreen,
  onLeave,
}: {
  channelName: string;
  muted: boolean;
  screenOn: boolean;
  onMute: () => void;
  onScreen: () => void;
  onLeave: () => void;
}) {
  return (
    <div className="border-t border-black/30 bg-[#232428] px-2 py-2">
      <div className="flex items-center justify-between px-1">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-discord-green">🔊 Voice Connected</div>
          <div className="truncate text-xs text-discord-muted">{channelName}</div>
        </div>
        <button onClick={onLeave} title="Disconnect" className="rounded p-1.5 text-discord-muted hover:bg-discord-hover hover:text-discord-danger">
          ⛔
        </button>
      </div>
      <div className="mt-1.5 flex gap-1.5">
        <Ctl active={muted} onClick={onMute} danger>{muted ? "Unmute" : "Mute"}</Ctl>
        <Ctl active={screenOn} onClick={onScreen}>{screenOn ? "Stop Share" : "Share Screen"}</Ctl>
      </div>
    </div>
  );
}

function Ctl({ children, onClick, active, danger }: { children: React.ReactNode; onClick: () => void; active?: boolean; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex-1 rounded px-2 py-1.5 text-xs font-medium transition",
        active
          ? danger
            ? "bg-discord-danger text-white"
            : "bg-discord-accent text-white"
          : "bg-discord-card text-discord-text hover:bg-discord-hover"
      )}
    >
      {children}
    </button>
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
