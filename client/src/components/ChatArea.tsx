import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, uploadFile, type UploadedFile } from "../api/client";
import { getSocket } from "../lib/socket";
import { useUI } from "../store/ui";
import { useVoice } from "../store/voice";
import { useUnread } from "../store/unread";
import { getLastRead, setLastRead } from "../lib/lastRead";
import { maybeCompressImage } from "../lib/imageCompress";
import { sharedContentToFile } from "../lib/push";
import { useShare } from "../store/share";
import { joinVoice, leaveVoice, toggleMute, toggleDeafen, toggleScreen, toggleCamera, flipCamera, toggleSpeaker } from "../lib/voice";
import type { Message as Msg } from "../types";
import { useI18n } from "../lib/i18n";
import { isAndroidApp } from "../lib/platform";
import { PhoneIcon, PhoneOffIcon, MicIcon, MicOffIcon, CameraIcon, FlipCameraIcon, ScreenIcon, PinIcon, MenuIcon, UsersIcon, BookmarkIcon, HeadphonesIcon, HeadphonesOffIcon, SearchIcon, MessageIcon, SpeakerIcon, XIcon } from "./Icons";
import MessageItem from "./MessageItem";
import Composer from "./Composer";
import PinsModal from "./PinsModal";
import BookmarksModal from "./BookmarksModal";
import SearchModal from "./SearchModal";
import VoiceStage, { CallTimer } from "./VoiceStage";
import ContextMenu from "./ContextMenu";
import clsx from "clsx";

interface ChannelInfo {
  id: string;
  name: string;
  type: string;
  topic?: string | null;
  guildId: string | null;
}

export default function ChatArea({ onOpenNav }: { onOpenNav?: () => void }) {
  const { currentChannelId, toggleMembers, immersive, setImmersive } = useUI();
  const { t } = useI18n();
  const voice = useVoice();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Msg | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showPins, setShowPins] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [callMoreMenu, setCallMoreMenu] = useState<{ x: number; y: number } | null>(null);
  // Voice channels: text chat lives beside the stage (desktop) or behind a
  // toggle (phones, stage-first).
  const [showChat, setShowChat] = useState(() => window.innerWidth >= 768);
  const [firstUnreadId, setFirstUnreadId] = useState<string | null>(null);
  const pendingShare = useShare((s) => s.pending);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const callMoreBtnRef = useRef<HTMLButtonElement>(null);
  // Older-history pagination: scroll to the top → fetch the previous page.
  const [hasMore, setHasMore] = useState(true);
  const loadingOlder = useRef(false);
  const prepending = useRef(false); // suppress auto-scroll-to-bottom on prepend

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (!arr.length) return;
    setUploading(true);
    try {
      // Photos are downscaled client-side first — huge savings on mobile data.
      const compact = await Promise.all(arr.map(maybeCompressImage));
      const up = await Promise.all(compact.map((f) => uploadFile(f)));
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

  // Fetch the page before the oldest loaded message and prepend it, keeping
  // the viewport anchored (scrollHeight delta trick).
  const loadOlder = useCallback(async () => {
    const el = scrollRef.current;
    const oldest = messages[0];
    if (!el || !oldest || loadingOlder.current || !hasMore || !currentChannelId) return;
    loadingOlder.current = true;
    try {
      const older = await api<Msg[]>(`/api/channels/${currentChannelId}/messages?cursor=${oldest.id}&limit=50`);
      if (older.length < 50) setHasMore(false);
      if (older.length) {
        const prevHeight = el.scrollHeight;
        prepending.current = true;
        setMessages((prev) => [...older.filter((m) => !prev.some((x) => x.id === m.id)), ...prev]);
        requestAnimationFrame(() => {
          el.scrollTop += el.scrollHeight - prevHeight;
        });
      }
    } catch {
      /* retried on next scroll */
    } finally {
      loadingOlder.current = false;
    }
  }, [messages, hasMore, currentChannelId]);

  useEffect(() => {
    if (!history) return;
    setHasMore(history.length >= 50);
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
    if (prepending.current) {
      prepending.current = false; // history prepend — keep the viewport where it is
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Reset composer state when switching channels.
  useEffect(() => {
    setAttachments([]);
    setReplyingTo(null);
    setShowPins(false);
  }, [currentChannelId]);

  // Desktop focus mode: joining a voice stage hides the rail + channel list
  // (the ☰ button in the header brings them back).
  const stageCallActive = !!channel && channel.type === "VOICE" && voice.channelId === channel.id;
  useEffect(() => {
    setImmersive(stageCallActive);
    return () => setImmersive(false);
  }, [stageCallActive, setImmersive]);

  if (!currentChannelId || !channel) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center bg-discord-bg text-discord-muted">
        <p>Select a conversation or channel to start chatting.</p>
      </main>
    );
  }

  function applyShare() {
    const s = useShare.getState().pending;
    if (!s || !currentChannelId) return;
    if (s.dataB64) {
      const f = sharedContentToFile(s);
      if (f) addFiles([f]);
    } else if (s.text) {
      sendMessage({ channelId: currentChannelId, content: s.text, attachments: [] });
    }
    useShare.getState().set(null);
  }

  const isDM = !channel.guildId;
  const isVoice = channel.type === "VOICE";
  const inThisCall = voice.channelId === channel.id;
  const callMembers = voice.occupancy[channel.id] ?? [];
  const typing = Object.values(typingUsers);
  const inStageCall = isVoice && inThisCall;

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
        <button
          onClick={() => {
            // Desktop in a stage call: toggle the hidden channel sidebar;
            // phones: open the drawer as usual.
            if (window.innerWidth >= 768) setImmersive(!immersive);
            else onOpenNav?.();
          }}
          className={`-ml-1 rounded p-1.5 text-discord-muted hover:bg-discord-hover hover:text-white ${
            immersive || inStageCall ? "" : "md:hidden"
          }`}
          title="Channels"
        >
          <MenuIcon size={20} />
        </button>
        <span className="shrink-0 text-xl text-discord-faint">{isDM ? "@" : isVoice ? "🔊" : "#"}</span>
        <span className="min-w-0 truncate font-semibold text-white">{channel.name}</span>
        {inThisCall && <CallTimer className="shrink-0 text-xs text-discord-green" />}
        {channel.topic && (
          <span className="hidden min-w-0 items-center gap-2 sm:flex">
            <span className="h-5 w-px shrink-0 bg-discord-card" />
            <span className="truncate text-sm text-discord-muted">{channel.topic}</span>
          </span>
        )}

        {/* Voice channel: toggle the side chat panel. */}
        {isVoice && (
          <button
            onClick={() => setShowChat((v) => !v)}
            className={`ml-auto shrink-0 rounded p-1.5 hover:bg-discord-hover ${showChat ? "text-white" : "text-discord-muted hover:text-white"}`}
            title={t("voice.openChat")}
          >
            <MessageIcon size={18} />
          </button>
        )}

        {/* During a DM call on a phone every pixel goes to the call controls. */}
        <button
          onClick={() => setShowSearch(true)}
          className={`${isVoice ? "" : "ml-auto"} shrink-0 rounded p-1.5 text-discord-muted hover:bg-discord-hover hover:text-white ${isDM && inThisCall ? "max-sm:hidden" : ""}`}
          title={t("search.title")}
        >
          <SearchIcon size={18} />
        </button>

        {/* Phones: pins/bookmarks don't fit next to voice/call controls. */}
        <button
          onClick={() => setShowPins(true)}
          className={`shrink-0 rounded p-1.5 text-discord-muted hover:bg-discord-hover hover:text-white ${(isDM && inThisCall) || isVoice ? "max-sm:hidden" : ""}`}
          title={t("channel.pinnedMessages")}
        >
          <PinIcon size={18} />
        </button>

        <button
          onClick={() => setShowBookmarks(true)}
          className={`shrink-0 rounded p-1.5 text-discord-muted hover:bg-discord-hover hover:text-white ${(isDM && inThisCall) || isVoice ? "max-sm:hidden" : ""}`}
          title="Bookmarks"
        >
          <BookmarkIcon size={18} />
        </button>

        {/* Phones: the member list is a drawer — this opens it. Static on lg+. */}
        {!isDM && (
          <button
            onClick={toggleMembers}
            className="rounded p-1.5 text-discord-muted hover:bg-discord-hover hover:text-white lg:hidden"
            title={t("members.title")}
          >
            <UsersIcon size={18} />
          </button>
        )}

        {isDM && (
          <div className="flex shrink-0 items-center gap-2">
            {callMembers.length > 0 && !inThisCall && (
              <span className="shrink-0 text-xs text-discord-green">● {t("voice.inCall")}</span>
            )}
            {!inThisCall ? (
              <button
                onClick={() => joinVoice(channel.id)}
                className="flex shrink-0 items-center gap-2 rounded-full bg-discord-green px-3 py-1.5 text-sm font-medium text-white hover:brightness-110 sm:px-4"
                title={t("voice.startCall")}
              >
                <PhoneIcon size={16} />
                <span className="hidden sm:inline">{t("voice.call")}</span>
              </button>
            ) : (
              <>
                <HeaderBtn active={voice.muted} onClick={toggleMute} title={voice.muted ? t("voice.unmute") : t("voice.mute")}>
                  {voice.muted ? <MicOffIcon size={16} /> : <MicIcon size={16} />}
                </HeaderBtn>
                <HeaderBtn active={voice.cameraOn} onClick={toggleCamera} title={voice.cameraOn ? t("voice.cameraOff") : t("voice.camera")}>
                  <CameraIcon size={16} />
                </HeaderBtn>
                {/* Desktop: room for every toggle inline. Phones: the rest
                    collapses into a "⋯" menu — a fixed 3-button header never
                    overflows, regardless of which Android extras are active. */}
                <HeaderBtn className="hidden sm:flex" active={voice.deafened} onClick={toggleDeafen} title={voice.deafened ? t("voice.undeafen") : t("voice.deafen")}>
                  {voice.deafened ? <HeadphonesOffIcon size={16} /> : <HeadphonesIcon size={16} />}
                </HeaderBtn>
                {isAndroidApp() && voice.cameraOn && (
                  <HeaderBtn className="hidden sm:flex" onClick={flipCamera} title={t("voice.flipCamera")}>
                    <FlipCameraIcon size={16} />
                  </HeaderBtn>
                )}
                <HeaderBtn className="hidden sm:flex" active={voice.screenOn} onClick={toggleScreen} title={voice.screenOn ? t("voice.stopShare") : t("voice.share")}>
                  <ScreenIcon size={16} />
                </HeaderBtn>
                {isAndroidApp() && (
                  <HeaderBtn className="hidden sm:flex" active={!voice.speakerOn} onClick={toggleSpeaker} title={voice.speakerOn ? t("voice.speakerOn") : t("voice.speakerOff")}>
                    <SpeakerIcon size={16} />
                  </HeaderBtn>
                )}
                <button
                  ref={callMoreBtnRef}
                  onClick={() => {
                    const r = callMoreBtnRef.current?.getBoundingClientRect();
                    setCallMoreMenu(r ? { x: r.right, y: r.bottom + 4 } : { x: 0, y: 0 });
                  }}
                  title={t("common.more")}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-discord-card text-discord-text hover:bg-discord-hover sm:hidden"
                >
                  <span className="text-lg leading-none">⋯</span>
                </button>
                <button
                  onClick={leaveVoice}
                  title={t("voice.leave")}
                  className="flex shrink-0 items-center gap-2 rounded-full bg-discord-danger px-3 py-1.5 text-sm font-medium text-white hover:brightness-110 sm:px-4"
                >
                  <PhoneOffIcon size={16} />
                  <span className="hidden sm:inline">{t("voice.leave")}</span>
                </button>
              </>
            )}
          </div>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Voice channel → Discord-style stage; the text chat docks beside it. */}
        {isVoice && (
          <div className={clsx("flex min-w-0 flex-1", showChat && "max-md:hidden")}>
            <VoiceStage channelId={channel.id} channelName={channel.name} guildId={channel.guildId} />
          </div>
        )}

        <div
          className={clsx(
            "flex min-w-0 flex-col",
            isVoice ? (showChat ? "w-full border-black/20 md:w-[380px] md:shrink-0 md:border-l" : "hidden") : "flex-1"
          )}
        >
          <div
            ref={scrollRef}
            onScroll={(e) => {
              if ((e.target as HTMLDivElement).scrollTop < 120) loadOlder();
            }}
            className="flex-1 overflow-y-auto overflow-x-hidden py-4"
          >
            {!hasMore && <Welcome name={channel.name} isDM={isDM} />}
            {hasMore && messages.length > 0 && (
              <div className="py-2 text-center text-xs text-discord-faint">{t("chat.loadingOlder")}</div>
            )}
            {messages.map((m, i) => (
              <div key={m.id} className="cc-fade-up">
                {firstUnreadId === m.id && (
                  <div className="my-1 flex items-center gap-2 px-4">
                    <div className="h-px flex-1 bg-discord-danger/60" />
                    <span className="rounded bg-discord-danger px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">New</span>
                  </div>
                )}
                <MessageItem message={m} grouped={isGrouped(messages[i - 1], m)} onReply={setReplyingTo} guildId={channel.guildId} />
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div className="px-4 pb-6">
            {pendingShare && (
              <div className="mb-2 flex items-center gap-2 rounded-lg bg-discord-card px-3 py-2 text-sm">
                <span className="shrink-0 text-discord-muted">📤 {t("share.received")}:</span>
                <span className="min-w-0 flex-1 truncate text-discord-text">
                  {pendingShare.text ?? pendingShare.mimeType}
                </span>
                <button
                  onClick={applyShare}
                  className="shrink-0 rounded bg-discord-accent px-3 py-1 text-xs font-medium text-white hover:brightness-110"
                >
                  {pendingShare.dataB64 ? t("share.attachHere") : t("share.sendHere")}
                </button>
                <button onClick={() => useShare.getState().set(null)} className="shrink-0 p-1 text-discord-muted hover:text-white">
                  <XIcon size={14} />
                </button>
              </div>
            )}
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
              {typing.length > 0 && `${typing.join(", ")} ${typing.length === 1 ? t("chat.typingOne") : t("chat.typingMany")}`}
            </div>
          </div>
        </div>
      </div>

      {showPins && <PinsModal channelId={channel.id} onClose={() => setShowPins(false)} />}
      {showBookmarks && <BookmarksModal onClose={() => setShowBookmarks(false)} />}
      {showSearch && <SearchModal guildId={channel.guildId} channelId={channel.id} onClose={() => setShowSearch(false)} />}
      {callMoreMenu && (
        <ContextMenu
          x={callMoreMenu.x}
          y={callMoreMenu.y}
          onClose={() => setCallMoreMenu(null)}
          items={[
            {
              label: voice.deafened ? t("voice.undeafen") : t("voice.deafen"),
              icon: voice.deafened ? <HeadphonesOffIcon size={15} /> : <HeadphonesIcon size={15} />,
              onClick: toggleDeafen,
            },
            {
              label: voice.screenOn ? t("voice.stopShare") : t("voice.share"),
              icon: <ScreenIcon size={15} />,
              onClick: toggleScreen,
            },
            ...(isAndroidApp()
              ? [
                  {
                    label: voice.speakerOn ? t("voice.speakerOn") : t("voice.speakerOff"),
                    icon: <SpeakerIcon size={15} />,
                    onClick: toggleSpeaker,
                  },
                ]
              : []),
            ...(isAndroidApp() && voice.cameraOn
              ? [{ label: t("voice.flipCamera"), icon: <FlipCameraIcon size={15} />, onClick: flipCamera }]
              : []),
          ]}
        />
      )}
    </main>
  );
}

function HeaderBtn({ active, onClick, title, children, className = "" }: { active?: boolean; onClick: () => void; title?: string; children: React.ReactNode; className?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex shrink-0 items-center justify-center rounded-full p-2 ${active ? "bg-discord-accent text-white" : "bg-discord-card text-discord-text hover:bg-discord-hover"} ${className}`}
    >
      {children}
    </button>
  );
}

function Welcome({ name, isDM }: { name: string; isDM: boolean }) {
  const { t } = useI18n();
  return (
    <div className="px-4 pb-4">
      <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-discord-card text-3xl">
        {isDM ? "@" : "#"}
      </div>
      <h2 className="text-2xl font-bold text-white">
        {isDM ? name : t("channel.welcomeTitle", { name })}
      </h2>
      <p className="text-discord-muted">
        {isDM ? t("channel.welcomeDm", { name }) : t("channel.welcomeChannel", { name })}
      </p>
    </div>
  );
}

function isGrouped(prev: Msg | undefined, cur: Msg): boolean {
  if (!prev) return false;
  if (prev.author.id !== cur.author.id) return false;
  return new Date(cur.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
}
