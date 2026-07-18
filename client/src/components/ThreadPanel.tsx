import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { getSocket } from "../lib/socket";
import { useUI } from "../store/ui";
import { useI18n } from "../lib/i18n";
import type { Message as Msg } from "../types";
import MessageItem from "./MessageItem";
import { XIcon } from "./Icons";

// Side panel with the discussion under one message (Discord-style thread).
// A thread is just a hidden channel — history, sending, reactions and live
// updates all reuse the regular message endpoints/events. Overlays the chat:
// full-screen on phones, a right-hand column on desktop.
export default function ThreadPanel() {
  const { t } = useI18n();
  const thread = useUI((s) => s.thread);
  const closeThread = useUI((s) => s.closeThread);
  const guildId = useUI((s) => s.currentGuildId);
  const threadId = thread?.id ?? null;

  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const { data: history } = useQuery<Msg[]>({
    queryKey: ["messages", threadId],
    queryFn: () => api<Msg[]>(`/api/channels/${threadId}/messages`),
    enabled: !!threadId,
  });
  useEffect(() => {
    setMessages(history ?? []);
  }, [history, threadId]);

  // Live events for the thread channel (same protocol as the main chat).
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !threadId) return;
    const subscribe = () => socket.emit("channel:subscribe", threadId);
    subscribe();
    socket.on("connect", subscribe); // re-sub after reconnects

    const onNew = (m: Msg) => {
      if (m.channelId !== threadId) return;
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    };
    const onEdit = (m: Msg) => setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...m } : x)));
    const onDelete = (p: { id: string }) => setMessages((prev) => prev.filter((x) => x.id !== p.id));
    const onReaction = (p: { messageId: string; emoji: string; userId: string; added: boolean }) =>
      setMessages((prev) =>
        prev.map((x) => {
          if (x.id !== p.messageId) return x;
          const reactions = (x.reactions ?? []).filter((r) => !(r.emoji === p.emoji && r.userId === p.userId));
          if (p.added) reactions.push({ emoji: p.emoji, userId: p.userId });
          return { ...x, reactions };
        })
      );

    socket.on("message:new", onNew);
    socket.on("message:edit", onEdit);
    socket.on("message:delete", onDelete);
    socket.on("message:reaction", onReaction);
    return () => {
      socket.emit("channel:unsubscribe", threadId);
      socket.off("connect", subscribe);
      socket.off("message:new", onNew);
      socket.off("message:edit", onEdit);
      socket.off("message:delete", onDelete);
      socket.off("message:reaction", onReaction);
    };
  }, [threadId]);

  // Keep pinned to the newest reply.
  useEffect(() => {
    bottomRef.current?.scrollIntoView();
  }, [messages.length, threadId]);

  // Auto-grow the reply box like the main composer.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [text]);

  async function send() {
    const content = text.trim();
    if (!content || !threadId || sending) return;
    setSending(true);
    try {
      const m = await api<Msg>(`/api/channels/${threadId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      setText("");
    } catch {
      /* keep the draft so nothing is lost */
    } finally {
      setSending(false);
    }
  }

  if (!thread) return null;

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-discord-bg sm:left-auto sm:w-[400px] sm:border-l sm:border-black/40 sm:shadow-2xl">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-black/30 px-3">
        <span className="text-lg">🧵</span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-discord-faint">{t("thread.title")}</div>
          <div className="truncate text-sm font-medium text-white">{thread.title}</div>
        </div>
        <button
          onClick={closeThread}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-discord-muted hover:bg-discord-hover hover:text-white"
          title={t("common.close")}
        >
          <XIcon size={18} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        {messages.length === 0 && <p className="px-4 py-6 text-sm text-discord-muted">{t("thread.empty")}</p>}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const grouped =
            !!prev &&
            prev.author.id === m.author.id &&
            new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000;
          return <MessageItem key={m.id} message={m} grouped={grouped} onReply={() => {}} guildId={guildId} inThread />;
        })}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-3 sm:pb-3">
        <div className="flex items-end gap-1 rounded-lg bg-discord-card px-2 py-1">
          <textarea
            ref={taRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={t("thread.placeholder")}
            className="min-w-0 flex-1 resize-none overflow-y-auto bg-transparent py-2 text-sm text-discord-text outline-none placeholder:text-discord-faint"
          />
          <button
            onClick={send}
            disabled={!text.trim() || sending}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-discord-muted hover:text-white disabled:opacity-40"
            title={t("thread.send")}
          >
            ➤
          </button>
        </div>
      </div>
    </div>
  );
}
