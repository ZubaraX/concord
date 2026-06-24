import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { api } from "../api/client";
import { useUI } from "../store/ui";
import { useVoice } from "../store/voice";
import { joinVoice, leaveVoice, toggleMute, toggleScreen, sendVoiceEmoji } from "../lib/voice";

export const CALL_EMOJIS = ["👍", "❤️", "😂", "🎉", "😮", "🔥"];
import type { Channel, DMSummary, Guild } from "../types";
import UserPanel from "./UserPanel";
import CreateChannelModal from "./CreateChannelModal";
import Avatar from "./Avatar";

export default function ChannelSidebar() {
  const { currentGuildId, currentChannelId, setChannel, openModal, openDM, openFriends } = useUI();
  const voice = useVoice();
  const [createCtx, setCreateCtx] = useState<{ type: "TEXT" | "VOICE"; parentId?: string } | null>(null);

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

  const openCreate = (type: "TEXT" | "VOICE", parentId?: string) => setCreateCtx({ type, parentId });

  if (!currentGuildId) {
    return <HomeSidebar activeChannelId={currentChannelId} onFriends={openFriends} onDM={openDM} />;
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
                    openCreate(
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
          onClick={() => openCreate("TEXT")}
          className="mt-2 w-full rounded px-2 py-1 text-left text-sm text-discord-muted hover:bg-discord-hover hover:text-white"
        >
          + Create channel
        </button>
      </div>

      {createCtx && currentGuildId && (
        <CreateChannelModal
          guildId={currentGuildId}
          defaultType={createCtx.type}
          parentId={createCtx.parentId}
          onClose={() => setCreateCtx(null)}
        />
      )}

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
  const [emojiOpen, setEmojiOpen] = useState(false);
  return (
    <div className="relative border-t border-black/30 bg-[#232428] px-2 py-2">
      <div className="flex items-center gap-2 px-1">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-discord-green opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-discord-green" />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-semibold text-white">Voice Connected</div>
          <div className="truncate text-xs text-discord-muted">🔊 {channelName}</div>
        </div>
        <button
          onClick={onLeave}
          title="Disconnect"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-discord-danger/90 text-white transition hover:bg-discord-danger"
        >
          ✕
        </button>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <CallBtn active={muted} danger={muted} onClick={onMute} label={muted ? "Unmute" : "Mute"}>
          {muted ? "🔇" : "🎙"}
        </CallBtn>
        <CallBtn active={screenOn} onClick={onScreen} label={screenOn ? "Stop" : "Share"}>
          🖥
        </CallBtn>
        <CallBtn active={emojiOpen} onClick={() => setEmojiOpen((v) => !v)} label="React">
          😀
        </CallBtn>
      </div>

      {emojiOpen && (
        <div className="absolute -top-12 left-2 right-2 flex justify-around rounded-lg bg-discord-rail p-1.5 shadow-xl">
          {CALL_EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => {
                sendVoiceEmoji(e);
                setEmojiOpen(false);
              }}
              className="rounded p-1 text-xl hover:bg-discord-hover"
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CallBtn({
  children,
  label,
  onClick,
  active,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={clsx(
        "flex flex-col items-center gap-0.5 rounded-md py-1.5 text-base transition",
        active
          ? danger
            ? "bg-discord-danger text-white"
            : "bg-discord-accent text-white"
          : "bg-discord-card text-discord-text hover:bg-discord-hover"
      )}
    >
      <span>{children}</span>
      <span className="text-[10px] font-medium">{label}</span>
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

// Home view (no guild selected): Friends button + DM conversation list.
function HomeSidebar({
  activeChannelId,
  onFriends,
  onDM,
}: {
  activeChannelId: string | null;
  onFriends: () => void;
  onDM: (id: string) => void;
}) {
  const voice = useVoice();
  const { data: dms = [] } = useQuery<DMSummary[]>({
    queryKey: ["dms"],
    queryFn: () => api<DMSummary[]>("/api/dms"),
  });

  return (
    <aside className="flex w-60 flex-col bg-discord-sidebar">
      <div className="flex h-12 items-center border-b border-black/20 px-4 font-semibold shadow-sm">
        Home
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-3">
        <button
          onClick={onFriends}
          className={clsx(
            "mb-2 flex w-full items-center gap-2 rounded px-2 py-2 text-sm font-medium",
            !activeChannelId ? "bg-discord-active text-white" : "text-discord-muted hover:bg-discord-hover hover:text-white"
          )}
        >
          👥 Friends
        </button>

        <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-discord-muted">
          Direct Messages
        </div>
        {dms.length === 0 && <div className="px-2 py-1 text-sm text-discord-faint">No DMs yet.</div>}
        {dms.map((dm) => {
          const inCall = (voice.occupancy[dm.id] ?? []).length > 0;
          return (
            <button
              key={dm.id}
              onClick={() => onDM(dm.id)}
              className={clsx(
                "mt-0.5 flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm",
                activeChannelId === dm.id ? "bg-discord-active text-white" : "text-discord-muted hover:bg-discord-hover hover:text-discord-text"
              )}
            >
              <Avatar user={dm.otherUser} size={28} status={dm.otherUser?.status ?? "OFFLINE"} />
              <span className="truncate">{dm.name}</span>
              {inCall && <span className="ml-auto text-xs text-discord-green">📞</span>}
            </button>
          );
        })}
      </div>
      {voice.channelId && (
        <VoiceControlBar
          channelName={dms.find((d) => d.id === voice.channelId)?.name ?? "Call"}
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
