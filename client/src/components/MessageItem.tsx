import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { useAuth } from "../store/auth";
import { useUI } from "../store/ui";
import { useBookmarks } from "../store/bookmarks";
import { useLightbox } from "../store/lightbox";
import { serverPath } from "../lib/serverUrl";
import type { Attachment, Guild, LinkEmbed, Message } from "../types";
import Avatar from "./Avatar";
import { renderMarkdown, type EmojiMap } from "../lib/markdown";
import { useI18n } from "../lib/i18n";
import ContextMenu, { type MenuItem } from "./ContextMenu";
import InviteCard from "./InviteCard";
import PollView from "./PollView";
import EmojiPicker from "./EmojiPicker";
import ForwardModal from "./ForwardModal";

// Scroll to a message (if it's currently loaded) and flash-highlight it.
export function jumpToMessage(id: string) {
  const el = document.getElementById(`msg-${id}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("cc-flash");
  setTimeout(() => el.classList.remove("cc-flash"), 1600);
}

// Copy text with a fallback for WebViews where navigator.clipboard is missing
// or blocked (some Android builds). Prefers the user's current selection so
// "Copy" respects a partial highlight, falling back to the whole message.
export function copyMessageText(fallback: string) {
  const selected = window.getSelection?.()?.toString();
  const text = selected && selected.trim() ? selected : fallback;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
  } else {
    legacyCopy(text);
  }
}
// True when a message is nothing but emoji (unicode and/or :custom:) — such
// messages render jumbo-sized, Discord-style. Capped at 8 so a wall of emoji
// stays normal.
function isEmojiOnly(content: string): boolean {
  const t = content.trim();
  if (!t || t.length > 200) return false;
  // Custom-emoji-only: “:name: :name:” with nothing else between.
  if (/^(:[a-z0-9_]+:\s*)+$/.test(t)) {
    return (t.match(/:[a-z0-9_]+:/g) ?? []).length <= 8;
  }
  // Unicode-emoji-only: strip emoji constituents; anything left → not jumbo.
  const stripped = t.replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}‍️\s]/gu, "");
  if (stripped) return false;
  try {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    const count = [...seg.segment(t)].filter((s) => s.segment.trim()).length;
    return count > 0 && count <= 8;
  } catch {
    return t.length <= 16; // ancient WebView without Intl.Segmenter
  }
}

function legacyCopy(text: string) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
  } catch {
    /* nothing more we can do */
  }
  document.body.removeChild(ta);
}

function MessageItem({
  message,
  grouped,
  onReply,
  guildId,
  inThread,
}: {
  message: Message;
  grouped: boolean;
  onReply: (m: Message) => void;
  guildId?: string | null;
  inThread?: boolean; // rendered inside a ThreadPanel — no nested threads
}) {
  const { user } = useAuth();
  const { t } = useI18n();
  const { openProfile, setChannel } = useUI();
  const [hover, setHover] = useState(false);
  const [picker, setPicker] = useState<{ x: number; y: number } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [forwarding, setForwarding] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const mine = user?.id === message.author.id;
  const time = new Date(message.createdAt);
  const rowRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  // Slide-in animation (fx-full only) for messages that just arrived — not
  // for history rendered on channel open. Decided once, on first render.
  const [fresh] = useState(() => Date.now() - new Date(message.createdAt).getTime() < 4000);

  // Grow the edit box to fit its content (layout effect → no visible jitter).
  useLayoutEffect(() => {
    const el = editRef.current;
    if (editing && el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 320) + "px";
    }
  }, [editing, draft]);

  // Reuses the guild query already cached by ChannelSidebar/MemberList — no
  // extra fetch just to resolve :custom_emoji: tokens.
  const { data: guild } = useQuery<Guild>({ queryKey: ["guild", guildId], enabled: false });
  const emojiMap = useMemo<EmojiMap>(() => {
    const map: EmojiMap = {};
    for (const e of guild?.emojis ?? []) map[e.name] = serverPath(e.url);
    return map;
  }, [guild?.emojis]);
  const channelList = useMemo(
    () => (guild?.channels ?? []).filter((c) => c.type === "TEXT").map((c) => ({ id: c.id, name: c.name })),
    [guild?.channels]
  );

  // Only real mice/trackpads trigger hover — touch taps synthesize a
  // "pointerenter" with no matching "leave", which would otherwise leave the
  // action toolbar stuck open after a tap/swipe.
  const setHoverIfMouse = (v: boolean) => (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") setHover(v);
  };

  // Open the action menu anchored to a trigger element (the "⋯" button), just
  // below it — predictable, unlike anchoring to a tall message's corner.
  function openMenuAt(el: HTMLElement) {
    const r = el.getBoundingClientRect();
    setMenu({ x: r.left, y: r.bottom + 4 });
  }

  // Emoji-only message (unicode or :custom:, up to 8) → rendered extra large.
  const jumbo = useMemo(() => isEmojiOnly(message.content), [message.content]);

  // Parse markdown once per content change, not on every parent re-render.
  const body = useMemo(
    () =>
      renderMarkdown(message.content, {
        customEmojis: emojiMap,
        channels: channelList,
        myUsername: user?.username,
        onChannelClick: setChannel,
        jumbo,
      }),
    [message.content, emojiMap, channelList, user?.username, setChannel, jumbo]
  );

  // Invite links become one-click join cards (no code pasting).
  const inviteCodes = useMemo(() => {
    const codes = [...(message.content ?? "").matchAll(/\/invite\/([\w-]{4,})/g)].map((m) => m[1]);
    return [...new Set(codes)].slice(0, 2);
  }, [message.content]);

  const embeds = useMemo<LinkEmbed[]>(() => {
    if (!message.embedsJson) return [];
    try {
      return JSON.parse(message.embedsJson);
    } catch {
      return [];
    }
  }, [message.embedsJson]);

  // First link in the message → a one-tap "Copy Link" action (mobile can't
  // easily select a URL by hand inside the message).
  const firstLink = useMemo(() => message.content?.match(/https?:\/\/[^\s]+/)?.[0] ?? null, [message.content]);

  function saveEdit() {
    const content = draft.trim();
    setEditing(false);
    if (content && content !== message.content) {
      api(`/api/messages/${message.id}`, { method: "PATCH", body: JSON.stringify({ content }) }).catch(() => {});
    }
  }

  function setPin(pinned: boolean) {
    api(`/api/messages/${message.id}/pin`, { method: pinned ? "PUT" : "DELETE" }).catch(() => {});
  }

  // Open the message's thread — creating it server-side first if needed
  // (the POST is idempotent: an existing thread is just returned).
  async function openThread() {
    try {
      const th = await api<{ id: string; name: string }>(`/api/messages/${message.id}/thread`, { method: "POST" });
      useUI.getState().openThread({ id: th.id, title: th.name });
    } catch {
      /* no access / DM channel — nothing to open */
    }
  }

  const bookmarked = useBookmarks((s) => s.bookmarks.some((b) => b.id === message.id));
  const menuItems: MenuItem[] = [
    { label: t("profile.viewProfile"), icon: "👤", onClick: () => openProfile(message.author.id) },
    { label: t("msg.addReaction"), icon: "😀", onClick: () => { const r = rowRef.current?.getBoundingClientRect(); setPicker(r ? { x: Math.max(8, r.right - 288), y: r.top } : { x: 100, y: 100 }); } },
    { label: t("common.reply"), icon: "↩️", onClick: () => onReply(message) },
    // Threads exist only in guild text channels, and never nested.
    ...(guildId && !inThread
      ? [{ label: message.threadId ? t("thread.open") : t("thread.start"), icon: "🧵", onClick: openThread }]
      : []),
    { label: t("forward.title"), icon: "↪️", onClick: () => setForwarding(true) },
    { label: t("msg.copyText"), icon: "📋", onClick: () => copyMessageText(message.content) },
    ...(firstLink ? [{ label: t("msg.copyLink"), icon: "🔗", onClick: () => copyMessageText(firstLink) }] : []),
    {
      label: bookmarked ? t("msg.removeBookmark") : t("msg.bookmark"),
      icon: "🔖",
      onClick: () => useBookmarks.getState().toggle(message, useUI.getState().currentGuildId),
    },
    { label: message.pinned ? t("common.unpin") : t("common.pin"), icon: "📌", onClick: () => setPin(!message.pinned) },
    ...(mine
      ? [
          { label: t("common.edit"), icon: "✏️", onClick: () => { setDraft(message.content); setEditing(true); } },
          { label: t("common.delete"), icon: "🗑", danger: true, onClick: () => api(`/api/messages/${message.id}`, { method: "DELETE" }).catch(() => {}) },
        ]
      : []),
  ];

  // Group reactions by emoji → count + whether I reacted.
  const reactionGroups = useMemo(() => {
    const map = new Map<string, { count: number; mine: boolean }>();
    for (const r of message.reactions ?? []) {
      const g = map.get(r.emoji) ?? { count: 0, mine: false };
      g.count++;
      if (r.userId === user?.id) g.mine = true;
      map.set(r.emoji, g);
    }
    return [...map.entries()];
  }, [message.reactions, user?.id]);

  const [bursts, setBursts] = useState<{ id: number; x: number; y: number; emoji: string; dx: number; dy: number }[]>([]);

  // Phones: drag a message to the left → reply. The row follows your finger
  // (visual feedback) and a reply arrow fades in; releasing past the threshold
  // fires the reply. Only engages on a deliberate horizontal drag so vertical
  // scrolling and text selection still work.
  const REPLY_THRESHOLD = 64;
  const [swipeX, setSwipeX] = useState(0);
  const swipeRef = useRef<{ x: number; y: number; active: boolean } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    swipeRef.current = { x: t.clientX, y: t.clientY, active: false };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const s = swipeRef.current;
    if (!s) return;
    const t = e.touches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (!s.active && (dx > -12 || Math.abs(dy) > Math.abs(dx))) return; // not a left-drag
    s.active = true;
    setSwipeX(Math.max(dx, -96)); // dx is negative; cap the pull
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = swipeRef.current;
    swipeRef.current = null;
    const reached = swipeX <= -REPLY_THRESHOLD;
    setSwipeX(0);
    if (s?.active) {
      e.stopPropagation(); // don't also trigger AppLayout's drawer gesture
      if (reached) onReply(message);
    }
  };

  function toggleReaction(emoji: string, at?: { x: number; y: number }) {
    setPicker(null);
    const mineReacted = (message.reactions ?? []).some((r) => r.emoji === emoji && r.userId === user?.id);
    const enc = encodeURIComponent(emoji);
    api(`/api/messages/${message.id}/reactions/${enc}`, { method: mineReacted ? "DELETE" : "PUT" }).catch(() => {});
    // Celebratory burst where you clicked (only when adding). Reactions picked
    // from the emoji picker carry no cursor position — burst from the row.
    if (!mineReacted) {
      const r = rowRef.current?.getBoundingClientRect();
      const origin = at ?? (r ? { x: r.left + Math.min(r.width / 2, 320), y: r.top + r.height / 2 } : null);
      if (!origin) return;
      // 🎉 goes full confetti; everything else gets the small pop.
      const party = emoji === "🎉" || emoji === "🎊";
      const pool = party ? ["🎉", "🎊", "✨", "🎈"] : [emoji];
      const count = party ? 18 : 6;
      const now = Date.now();
      const parts = Array.from({ length: count }, (_, i) => ({
        id: now + i,
        x: origin.x,
        y: origin.y,
        emoji: pool[i % pool.length],
        dx: Math.round((Math.random() - 0.5) * (party ? 260 : 90)),
        dy: -Math.round(30 + Math.random() * (party ? 160 : 60)),
      }));
      setBursts((prev) => [...prev, ...parts]);
      setTimeout(() => setBursts((prev) => prev.filter((p) => !parts.some((q) => q.id === p.id))), 800);
    }
  }

  return (
    <div
      ref={rowRef}
      id={`msg-${message.id}`}
      onPointerEnter={setHoverIfMouse(true)}
      onPointerLeave={setHoverIfMouse(false)}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onContextMenu={(e) => {
        // Long-pressing a link → let the WebView's own menu handle it (Copy
        // link address / open), instead of hijacking with the action menu.
        if ((e.target as HTMLElement).closest("a")) return;
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY }); // at the cursor (desktop) / bottom sheet (mobile)
      }}
      style={{ transform: swipeX ? `translateX(${swipeX}px)` : undefined, transition: swipeX ? "none" : "transform 0.2s ease" }}
      className={`group relative flex scroll-mt-6 gap-4 px-4 hover:bg-black/10 ${fresh ? "cc-msg-in " : ""}${grouped ? "py-0.5" : "mt-3 py-0.5"} ${message.pinned ? "bg-yellow-500/5" : ""}`}
    >
      {/* Swipe-to-reply arrow, revealed as you pull the row left. */}
      {swipeX < 0 && (
        <div
          className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2"
          style={{ transform: `translateX(${-swipeX}px)`, opacity: Math.min(1, -swipeX / REPLY_THRESHOLD) }}
        >
          <span className={`text-lg ${swipeX <= -REPLY_THRESHOLD ? "text-discord-accent" : "text-discord-muted"}`}>↩️</span>
        </div>
      )}
      <div className="w-10 shrink-0">
        {!grouped ? (
          <button onClick={() => openProfile(message.author.id)} title={t("msg.viewProfile")} className="rounded-full">
            <Avatar user={message.author} size={40} />
          </button>
        ) : (
          <span className="hidden w-10 text-right text-[10px] leading-6 text-discord-faint group-hover:inline-block">
            {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <button onClick={() => openProfile(message.author.id)} className="font-medium text-white hover:underline">
              {message.author.displayName ?? message.author.username}
            </button>
            <span className="text-xs text-discord-faint">
              {time.toLocaleString([], {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        )}

        {message.replyTo && (
          <button
            onClick={() => message.replyTo && jumpToMessage(message.replyTo.id)}
            className="mb-0.5 flex max-w-full items-center gap-1 truncate text-left text-xs text-discord-muted hover:text-discord-text"
            title={t("msg.jumpToMessage")}
          >
            <span className="text-discord-faint">↰</span>
            <strong>{message.replyTo.author.displayName ?? message.replyTo.author.username}</strong>{" "}
            <span className="truncate">{message.replyTo.content.slice(0, 80)}</span>
          </button>
        )}

        {message.pinned && <div className="mb-0.5 text-[10px] font-semibold text-yellow-500">📌 {t("msg.pinned")}</div>}

        {editing ? (
          <textarea
            autoFocus
            value={draft}
            ref={editRef}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); }
              if (e.key === "Escape") setEditing(false);
            }}
            className="w-full resize-none overflow-y-auto rounded bg-discord-deep px-3 py-2 text-discord-text outline-none focus:ring-1 focus:ring-discord-accent"
          />
        ) : (
          message.content && (
            <div className={`select-text whitespace-pre-wrap text-discord-text [-webkit-user-select:text] [overflow-wrap:anywhere] ${jumbo ? "text-[2.5rem] leading-[1.15]" : ""}`}>
              {body}
              {message.editedAt && <span className="ml-1 text-[10px] text-discord-faint">(edited)</span>}
            </div>
          )
        )}

        {inviteCodes.map((c) => (
          <InviteCard key={c} code={c} />
        ))}

        {message.pollJson && <PollView message={message} />}

        {message.attachments?.length > 0 && (
          <div className="mt-1 flex flex-col gap-2">
            {message.attachments.map((a) => (
              <AttachmentView key={a.id} attachment={a} />
            ))}
          </div>
        )}

        {embeds.map((e, i) => (
          <a
            key={i}
            href={e.url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 flex max-w-[min(28rem,100%)] gap-3 rounded border-l-4 border-discord-accent bg-discord-card p-3 hover:bg-discord-hover"
          >
            {e.image && <img src={e.image} alt="" className="h-16 w-16 shrink-0 rounded object-cover" loading="lazy" />}
            <div className="min-w-0">
              {e.site && <div className="text-xs text-discord-faint">{e.site}</div>}
              {e.title && <div className="truncate font-medium text-discord-link">{e.title}</div>}
              {e.description && <div className="line-clamp-2 text-sm text-discord-muted">{e.description}</div>}
            </div>
          </a>
        ))}

        {reactionGroups.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {reactionGroups.map(([emoji, g]) => (
              <button
                key={emoji}
                onClick={(e) => toggleReaction(emoji, { x: e.clientX, y: e.clientY })}
                className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-sm transition ${
                  g.mine
                    ? "border-discord-accent bg-discord-accent/20 text-white"
                    : "border-transparent bg-discord-card text-discord-text hover:border-discord-hover"
                }`}
              >
                <span>{emoji}</span>
                <span className="text-xs text-discord-muted">{g.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Thread chip — the message has a discussion hanging off it. */}
        {message.threadId && !inThread && (
          <button
            onClick={() =>
              useUI.getState().openThread({
                id: message.threadId!,
                title: message.content.replace(/\s+/g, " ").trim().slice(0, 60) || "…",
              })
            }
            className="mt-1 flex items-center gap-1.5 rounded-md bg-discord-card px-2 py-1 text-xs font-medium text-discord-link hover:bg-discord-hover"
          >
            🧵 {t("thread.open")}
          </button>
        )}
      </div>

      {/* Quick actions on hover (desktop). Everything else — copy, pin,
          bookmark, delete… — is on right-click. */}
      {hover && !editing && !menu && (
        <div className="absolute right-3 top-0 flex items-center gap-1 rounded bg-discord-rail shadow ring-1 ring-black/30">
          <button onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setPicker(picker ? null : { x: Math.max(8, r.left - 240), y: r.bottom + 4 }); }} className="px-2 py-1 text-sm text-discord-muted hover:text-white" title={t("msg.addReaction")}>😀</button>
          <button onClick={() => onReply(message)} className="px-2 py-1 text-sm text-discord-muted hover:text-white" title={t("common.reply")}>↩️</button>
          {mine && (
            <button onClick={() => { setDraft(message.content); setEditing(true); }} className="px-2 py-1 text-sm text-discord-muted hover:text-white" title={t("common.edit")}>✏️</button>
          )}
        </div>
      )}

      {picker && (
        // Full emoji picker for reactions (unicode grid + search), fixed &
        // clamped so it's always fully visible.
        <EmojiPicker
          anchor={picker}
          onPick={(e) => { setPicker(null); toggleReaction(e); }}
          onClose={() => setPicker(null)}
        />
      )}

      {bursts.length > 0 &&
        createPortal(
          bursts.map((p) => (
            <span
              key={p.id}
              className="cc-burst pointer-events-none fixed z-[90] text-base"
              style={{ left: p.x, top: p.y, "--dx": `${p.dx}px`, "--dy": `${p.dy}px` } as React.CSSProperties}
            >
              {p.emoji}
            </span>
          )),
          document.body
        )}

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}
      {forwarding && <ForwardModal message={message} onClose={() => setForwarding(false)} />}
    </div>
  );
}

const QUICK_EMOJIS = ["👍", "❤️", "😂", "🎉", "😮", "😢", "🔥", "👀"];

function AttachmentView({ attachment }: { attachment: Attachment }) {
  const src = serverPath(attachment.url);
  const isImage = attachment.mimeType?.startsWith("image/");
  const isVideo = attachment.mimeType?.startsWith("video/");
  const isAudio = attachment.mimeType?.startsWith("audio/");

  if (isImage) {
    // Stickers (sent via the sticker picker) render smaller, like Discord.
    const isSticker = attachment.filename.startsWith("sticker-");
    return (
      <button
        type="button"
        onClick={() => useLightbox.getState().open(src, attachment.filename)}
        className="block cursor-zoom-in"
      >
        <img
          src={src}
          alt={attachment.filename}
          className={isSticker ? "h-40 w-40 rounded-lg object-contain" : "max-h-96 max-w-full rounded-lg object-contain"}
          loading="lazy"
        />
      </button>
    );
  }
  if (isVideo) {
    return <video src={src} controls className="max-h-96 max-w-full rounded-lg" />;
  }
  if (isAudio) {
    return <AudioPlayer src={src} filename={attachment.filename} />;
  }
  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      download
      className="flex w-fit max-w-[min(28rem,100%)] items-center gap-3 rounded-lg bg-discord-card px-3 py-2.5 hover:bg-discord-hover"
    >
      <span className="text-2xl">📄</span>
      <span className="min-w-0">
        <span className="block truncate text-sm text-discord-link">{attachment.filename}</span>
        <span className="block text-xs text-discord-faint">{prettySize(attachment.size)}</span>
      </span>
    </a>
  );
}

// Voice-message / audio player styled like the app (Telegram-style bubble):
// round accent play button, a decorative waveform that doubles as a seek bar,
// and a time readout — instead of the browser's default <audio> chrome.
function AudioPlayer({ src, filename }: { src: string; filename: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [dur, setDur] = useState(0);
  const [cur, setCur] = useState(0);

  // Deterministic pseudo-random bar heights seeded by the filename, so the
  // "waveform" is stable across re-renders and devices.
  const bars = useMemo(() => {
    let h = 2166136261;
    for (let i = 0; i < filename.length; i++) {
      h ^= filename.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Array.from({ length: 30 }, () => {
      h ^= h << 13; h ^= h >>> 17; h ^= h << 5; h |= 0;
      return 0.25 + (Math.abs(h) % 100) / 133;
    });
  }, [filename]);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) a.pause();
    else a.play().catch(() => {});
  }
  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const a = audioRef.current;
    if (!a || !isFinite(dur) || dur <= 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur;
  }
  const fmt = (s: number) =>
    isFinite(s) && s > 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00";

  return (
    <div className="flex w-80 max-w-full items-center gap-3 rounded-2xl bg-discord-card px-3 py-2.5">
      <button
        onClick={toggle}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-discord-accent text-white transition hover:brightness-110"
      >
        {playing ? (
          <span className="flex gap-[3px]">
            <span className="h-3.5 w-1 rounded-sm bg-white" />
            <span className="h-3.5 w-1 rounded-sm bg-white" />
          </span>
        ) : (
          <span className="ml-0.5 inline-block border-y-[7px] border-l-[11px] border-y-transparent border-l-white" />
        )}
      </button>

      <div className="flex h-9 min-w-0 flex-1 cursor-pointer items-center gap-[2px]" onClick={seek}>
        {bars.map((b, i) => (
          <span
            key={i}
            className={`min-w-0 flex-1 rounded-full transition-colors ${
              dur > 0 && i / bars.length <= cur / dur ? "bg-discord-accent" : "bg-discord-faint/40"
            }`}
            style={{ height: `${Math.round(b * 100)}%` }}
          />
        ))}
      </div>

      <span className="shrink-0 text-xs tabular-nums text-discord-muted">
        {fmt(playing || cur > 0 ? cur : dur)}
      </span>

      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCur(0); }}
        onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
        onDurationChange={(e) => { const d = e.currentTarget.duration; if (isFinite(d)) setDur(d); }}
        onLoadedMetadata={(e) => {
          const a = e.currentTarget;
          if (isFinite(a.duration)) { setDur(a.duration); return; }
          // MediaRecorder webm quirk: duration stays Infinity until the
          // element is seeked far past the end once.
          const fix = () => {
            if (isFinite(a.duration)) setDur(a.duration);
            a.currentTime = 0;
            a.removeEventListener("timeupdate", fix);
          };
          a.addEventListener("timeupdate", fix);
          a.currentTime = 1e7;
        }}
      />
    </div>
  );
}

function prettySize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

const reactionSig = (m: Message) =>
  (m.reactions ?? []).map((r) => r.emoji + r.userId).sort().join(",");

// Re-render a message only when its identity, content, edit state, reactions,
// or grouping changes — not when sibling messages arrive.
export default memo(MessageItem, (a, b) => {
  return (
    a.message.id === b.message.id &&
    a.message.content === b.message.content &&
    a.message.editedAt === b.message.editedAt &&
    a.message.pinned === b.message.pinned &&
    a.message.embedsJson === b.message.embedsJson &&
    a.message.pollJson === b.message.pollJson &&
    a.message.threadId === b.message.threadId &&
    a.grouped === b.grouped &&
    reactionSig(a.message) === reactionSig(b.message)
  );
});
