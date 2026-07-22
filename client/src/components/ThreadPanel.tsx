import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, uploadFile, type UploadedFile } from "../api/client";
import { getSocket } from "../lib/socket";
import { useUI } from "../store/ui";
import { useI18n } from "../lib/i18n";
import { maybeCompressImage } from "../lib/imageCompress";
import type { Message as Msg } from "../types";
import MessageItem from "./MessageItem";
import Composer from "./Composer";
import { XIcon } from "./Icons";

// Side panel with the discussion under one message (Discord-style thread).
// A thread is just a hidden channel — history, sending, reactions, replies,
// attachments and live updates all reuse the regular message machinery.
// Overlays the chat: full-screen on phones, a right-hand column on desktop.
export default function ThreadPanel() {
  const { t } = useI18n();
  const thread = useUI((s) => s.thread);
  const closeThread = useUI((s) => s.closeThread);
  const guildId = useUI((s) => s.currentGuildId);
  const threadId = thread?.id ?? null;

  const [messages, setMessages] = useState<Msg[]>([]);
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Msg | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: history } = useQuery<Msg[]>({
    queryKey: ["messages", threadId],
    queryFn: () => api<Msg[]>(`/api/channels/${threadId}/messages`),
    enabled: !!threadId,
  });
  useEffect(() => {
    setMessages(history ?? []);
  }, [history, threadId]);

  // Reset per-thread composer state when switching threads.
  useEffect(() => {
    setAttachments(() => []);
    setReplyingTo(null);
  }, [threadId]);

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

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (!arr.length) return;
    setUploading(true);
    try {
      const compact = await Promise.all(arr.map(maybeCompressImage));
      const up = await Promise.all(compact.map((f) => uploadFile(f)));
      setAttachments((prev) => [...prev, ...up]);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setUploading(false);
    }
  }, []);

  // Send via socket (fast, with ack) falling back to REST — same as ChatArea.
  const sendMessage = useCallback(
    (payload: { channelId: string; content: string; attachments: UploadedFile[]; replyToId?: string }) => {
      const socket = getSocket();
      const addLocal = (m: Msg) => setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      const viaRest = () =>
        api<Msg>(`/api/channels/${payload.channelId}/messages`, { method: "POST", body: JSON.stringify(payload) })
          .then(addLocal)
          .catch(() => {});
      if (socket && socket.connected) {
        let acked = false;
        socket.emit("message:send", payload, (res: { ok?: boolean }) => {
          acked = true;
          if (!res?.ok) viaRest();
        });
        setTimeout(() => { if (!acked) viaRest(); }, 4000);
      } else {
        viaRest();
      }
      setReplyingTo(null);
    },
    []
  );

  if (!thread || !threadId) return null;

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
          return (
            <MessageItem key={m.id} message={m} grouped={grouped} onReply={setReplyingTo} guildId={guildId} inThread />
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-3 sm:pb-3">
        <Composer
          channelId={threadId}
          channelName={thread.title}
          attachments={attachments}
          setAttachments={setAttachments}
          uploading={uploading}
          addFiles={addFiles}
          replyingTo={replyingTo}
          onClearReply={() => setReplyingTo(null)}
          onSend={sendMessage}
        />
      </div>
    </div>
  );
}
