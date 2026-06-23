import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { getSocket } from "../lib/socket";
import { useUI } from "../store/ui";
import type { Channel, Guild, Message as Msg } from "../types";
import MessageItem from "./MessageItem";
import Composer from "./Composer";

export default function ChatArea() {
  const { currentGuildId, currentChannelId } = useUI();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: guild } = useQuery<Guild>({
    queryKey: ["guild", currentGuildId],
    queryFn: () => api<Guild>(`/api/guilds/${currentGuildId}`),
    enabled: !!currentGuildId,
  });
  const channel: Channel | undefined = guild?.channels.find((c) => c.id === currentChannelId);

  // Load history when the channel changes.
  const { data: history } = useQuery<Msg[]>({
    queryKey: ["messages", currentChannelId],
    queryFn: () => api<Msg[]>(`/api/channels/${currentChannelId}/messages`),
    enabled: !!currentChannelId,
  });

  useEffect(() => {
    if (history) setMessages(history);
  }, [history, currentChannelId]);

  // Subscribe to the channel room + wire live events.
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !currentChannelId) return;

    socket.emit("channel:subscribe", currentChannelId);

    const onNew = (m: Msg) => {
      if (m.channelId === currentChannelId) setMessages((prev) => [...prev, m]);
    };
    const onEdit = (m: Msg) =>
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...m } : x)));
    const onDelete = (p: { id: string }) =>
      setMessages((prev) => prev.filter((x) => x.id !== p.id));
    const onTyping = (p: { channelId: string; userId: string; username: string }) => {
      if (p.channelId !== currentChannelId) return;
      setTypingUsers((prev) => ({ ...prev, [p.userId]: p.username }));
      setTimeout(() => {
        setTypingUsers((prev) => {
          const next = { ...prev };
          delete next[p.userId];
          return next;
        });
      }, 4000);
    };

    socket.on("message:new", onNew);
    socket.on("message:edit", onEdit);
    socket.on("message:delete", onDelete);
    socket.on("typing:start", onTyping);

    return () => {
      socket.emit("channel:unsubscribe", currentChannelId);
      socket.off("message:new", onNew);
      socket.off("message:edit", onEdit);
      socket.off("message:delete", onDelete);
      socket.off("typing:start", onTyping);
    };
  }, [currentChannelId]);

  // Keep pinned to the bottom on new messages.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (!currentChannelId || !channel) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center bg-discord-bg text-discord-muted">
        <p>Select or create a channel to start chatting.</p>
      </main>
    );
  }

  const typing = Object.values(typingUsers);

  return (
    <main className="flex flex-1 flex-col bg-discord-bg">
      <header className="flex h-12 items-center gap-2 border-b border-black/20 px-4 shadow-sm">
        <span className="text-xl text-discord-faint">#</span>
        <span className="font-semibold text-white">{channel.name}</span>
        {channel.topic && (
          <>
            <span className="mx-2 h-5 w-px bg-discord-card" />
            <span className="truncate text-sm text-discord-muted">{channel.topic}</span>
          </>
        )}
      </header>

      <div className="flex-1 overflow-y-auto py-4">
        <ChannelWelcome name={channel.name} />
        {messages.map((m, i) => (
          <MessageItem
            key={m.id}
            message={m}
            grouped={isGrouped(messages[i - 1], m)}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="px-4 pb-6">
        <Composer channelId={currentChannelId} channelName={channel.name} />
        <div className="h-5 px-1 pt-1 text-xs text-discord-muted">
          {typing.length > 0 &&
            `${typing.join(", ")} ${typing.length === 1 ? "is" : "are"} typing…`}
        </div>
      </div>
    </main>
  );
}

function ChannelWelcome({ name }: { name: string }) {
  return (
    <div className="px-4 pb-4">
      <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-discord-card text-3xl">
        #
      </div>
      <h2 className="text-2xl font-bold text-white">Welcome to #{name}!</h2>
      <p className="text-discord-muted">This is the start of the #{name} channel.</p>
    </div>
  );
}

// Group consecutive messages from the same author within 5 minutes.
function isGrouped(prev: Msg | undefined, cur: Msg): boolean {
  if (!prev) return false;
  if (prev.author.id !== cur.author.id) return false;
  return new Date(cur.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
}
