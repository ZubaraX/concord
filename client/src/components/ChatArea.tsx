import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, uploadFile, type UploadedFile } from "../api/client";
import { getSocket } from "../lib/socket";
import { useUI } from "../store/ui";
import { useVoice } from "../store/voice";
import { useUnread } from "../store/unread";
import { getLastRead, setLastRead } from "../lib/lastRead";
import { joinVoice, leaveVoice, toggleMute, toggleScreen, toggleCamera } from "../lib/voice";
import type { Message as Msg } from "../types";
import MessageItem from "./MessageItem";
import Composer from "./Composer";
import PinsModal from "./PinsModal";

interface ChannelInfo {
  id: string;
  name: string;
  type: string;
  topic?: string | null;
  guildId: string | null;
}

export default function ChatArea() {
  const { currentChannelId } = useUI();
  const voice = useVoice();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Msg | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showPins, setShowPins] = useState(false);
  const [firstUnreadId, setFirstUnreadId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (!arr.length) return;
    setUploading(true);
    try {
      const up = await Promise.all(arr.map((f) => uploadFile(f)));
      setAttachments((prev) => [...prev, ...up]);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setUploading(false);
    }
  }, []);

  // Channel info by id — works for both guild channels and DMs.
  const { data: channel } = useQuery<ChannelInfo>({
    queryKey: ["channel", currentChannelId],
    queryFn: () => api<ChannelInfo>(`/api/channels/${currentChannelId}`),
    enabled: !!currentChannelId,
  });

  const { data: history } = useQuery<Msg[]>({
    queryKey: ["messages", currentChannelId],
    queryFn: () => api<Msg[]>(`/api/channels/${currentChannelId}/messages`),
    enabled: !!currentChannelId,
  });

  useEffect(() => {
    if (!history) return;
    setMessages(history);
    // "New messages" divider before the first message newer than last-read,
    // then mark the channel read.
    if (currentChannelId) {
      const lastRead = getLastRead(currentChannelId);
      const firstNew = history.find((m) => new Date(m.createdAt).getTime() > lastRead);
      setFirstUnreadId(firstNew && history.length && lastRead ? firstNew.id : null);
      setLastRead(currentChannelId);
      useUnread.getState().clear(currentChannelId);
    }
  }, [history, currentChannelId]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !currentChannelId) return;
    const subscribe = () => socket.emit("channel:subscribe", currentChannelId);
    subscribe();
    // Re-subscribe after a reconnect, otherwise we silently stop receiving
    // this channel's live messages/reactions.
    socket.on("connect", subscribe);

    const onNew = (m: Msg) => {
      if (m.channelId !== currentChannelId) return;
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      setLastRead(currentChannelId); // we're looking at it → stays read
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
    socket.on("message:reaction", onReaction);
    socket.on("typing:start", onTyping);
    return () => {
      socket.emit("channel:unsubscribe", currentChannelId);
      socket.off("connect", subscribe);
      socket.off("message:new", onNew);
      socket.off("message:edit", onEdit);
      socket.off("message:delete", onDelete);
      socket.off("message:reaction", onReaction);
      socket.off("typing:start", onTyping);
    };
  }, [currentChannelId]);

  // Reliable send: socket (fast) with ack, falling back to REST if the socket
  // is down or doesn't confirm — so messages never silently vanish.
  const sendMessage = useCallback(
    (payload: { channelId: string; content: string; attachments: UploadedFile[]; replyToId?: string }) => {
      const socket = getSocket();
      const addLocal = (m: Msg) => setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      const viaRest = () =>
        api<Msg>(`/api/channels/${payload.channelId}/messages`, { method: "POST", body: JSON.stringify(payload) })
          .then(addLocal)
          .catch(() => alert("Не удалось отправить сообщение. Проверьте соединение."));
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
    },
    []
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Reset composer state when switching channels.
  useEffect(() => {
    setAttachments([]);
    setReplyingTo(null);
    setShowPins(false);
  }, [currentChannelId]);

  if (!currentChannelId || !channel) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center bg-discord-bg text-discord-muted">
        <p>Select a conversation or channel to start chatting.</p>
      </main>
    );
  }

  const isDM = !channel.guildId;
  const inThisCall = voice.channelId === channel.id;
  const callMembers = voice.occupancy[channel.id] ?? [];
  const typing = Object.values(typingUsers);

  return (
    <main
      className="relative flex flex-1 flex-col bg-discord-bg"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
    >
      {dragOver && (
        <div className="pointer-events-none absolute inset-2 z-40 flex items-center justify-center rounded-xl border-4 border-dashed border-discord-accent bg-discord-accent/10 text-lg font-semibold text-white">
          Drop files to upload (no size limit)
        </div>
      )}
      <header className="flex h-12 items-center gap-2 border-b border-black/20 px-4 shadow-sm">
        <span className="text-xl text-discord-faint">{isDM ? "@" : "#"}</span>
        <span className="font-semibold text-white">{channel.name}</span>
        {channel.topic && (
          <>
            <span className="mx-2 h-5 w-px bg-discord-card" />
            <span className="truncate text-sm text-discord-muted">{channel.topic}</span>
          </>
        )}

        <button
          onClick={() => setShowPins(true)}
          className="ml-auto rounded p-1.5 text-discord-muted hover:bg-discord-hover hover:text-white"
          title="Pinned messages"
        >
          📌
        </button>

        {isDM && (
          <div className="flex items-center gap-2">
            {callMembers.length > 0 && !inThisCall && (
              <span className="text-xs text-discord-green">● In call</span>
            )}
            {!inThisCall ? (
              <button
                onClick={() => joinVoice(channel.id)}
                className="rounded bg-discord-green px-3 py-1.5 text-sm font-medium text-white hover:brightness-110"
                title="Start / join voice call"
              >
                📞 Call
              </button>
            ) : (
              <>
                <HeaderBtn active={voice.muted} onClick={toggleMute}>{voice.muted ? "Unmute" : "Mute"}</HeaderBtn>
                <HeaderBtn active={voice.cameraOn} onClick={toggleCamera}>{voice.cameraOn ? "Cam Off" : "Camera"}</HeaderBtn>
                <HeaderBtn active={voice.screenOn} onClick={toggleScreen}>{voice.screenOn ? "Stop Share" : "Share"}</HeaderBtn>
                <button onClick={leaveVoice} className="rounded bg-discord-danger px-3 py-1.5 text-sm font-medium text-white hover:brightness-110">
                  Leave
                </button>
              </>
            )}
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto py-4">
        <Welcome name={channel.name} isDM={isDM} />
        {messages.map((m, i) => (
          <div key={m.id}>
            {firstUnreadId === m.id && (
              <div className="my-1 flex items-center gap-2 px-4">
                <div className="h-px flex-1 bg-discord-danger/60" />
                <span className="rounded bg-discord-danger px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">New</span>
              </div>
            )}
            <MessageItem message={m} grouped={isGrouped(messages[i - 1], m)} onReply={setReplyingTo} />
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="px-4 pb-6">
        <Composer
          channelId={currentChannelId}
          channelName={channel.name}
          attachments={attachments}
          setAttachments={setAttachments}
          uploading={uploading}
          addFiles={addFiles}
          replyingTo={replyingTo}
          onClearReply={() => setReplyingTo(null)}
          onSend={sendMessage}
        />
        <div className="h-5 px-1 pt-1 text-xs text-discord-muted">
          {typing.length > 0 && `${typing.join(", ")} ${typing.length === 1 ? "is" : "are"} typing…`}
        </div>
      </div>

      {showPins && <PinsModal channelId={channel.id} onClose={() => setShowPins(false)} />}
    </main>
  );
}

function HeaderBtn({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-3 py-1.5 text-sm font-medium ${active ? "bg-discord-accent text-white" : "bg-discord-card text-discord-text hover:bg-discord-hover"}`}
    >
      {children}
    </button>
  );
}

function Welcome({ name, isDM }: { name: string; isDM: boolean }) {
  return (
    <div className="px-4 pb-4">
      <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-discord-card text-3xl">
        {isDM ? "@" : "#"}
      </div>
      <h2 className="text-2xl font-bold text-white">
        {isDM ? name : `Welcome to #${name}!`}
      </h2>
      <p className="text-discord-muted">
        {isDM ? `This is the beginning of your direct message history with ${name}.` : `This is the start of the #${name} channel.`}
      </p>
    </div>
  );
}

function isGrouped(prev: Msg | undefined, cur: Msg): boolean {
  if (!prev) return false;
  if (prev.author.id !== cur.author.id) return false;
  return new Date(cur.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
}
