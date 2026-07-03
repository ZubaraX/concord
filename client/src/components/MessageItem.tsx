import { memo, useMemo, useRef, useState } from "react";
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
import ContextMenu, { type MenuItem } from "./ContextMenu";
import InviteCard from "./InviteCard";
import PollView from "./PollView";

// Scroll to a message (if it's currently loaded) and flash-highlight it.
export function jumpToMessage(id: string) {
  const el = document.getElementById(`msg-${id}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("cc-flash");
  setTimeout(() => el.classList.remove("cc-flash"), 1600);
}

function MessageItem({
  message,
  grouped,
  onReply,
  guildId,
}: {
  message: Message;
  grouped: boolean;
  onReply: (m: Message) => void;
  guildId?: string | null;
}) {
  const { user } = useAuth();
  const { openProfile } = useUI();
  const [hover, setHover] = useState(false);
  const [picker, setPicker] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const mine = user?.id === message.author.id;
  const time = new Date(message.createdAt);
  const rowRef = useRef<HTMLDivElement>(null);

  // Reuses the guild query already cached by ChannelSidebar/MemberList — no
  // extra fetch just to resolve :custom_emoji: tokens.
  const { data: guild } = useQuery<Guild>({ queryKey: ["guild", guildId], enabled: false });
  const emojiMap = useMemo<EmojiMap>(() => {
    const map: EmojiMap = {};
    for (const e of guild?.emojis ?? []) map[e.name] = serverPath(e.url);
    return map;
  }, [guild?.emojis]);

  // Only real mice/trackpads trigger hover — touch taps synthesize a
  // "pointerenter" with no matching "leave", which would otherwise leave the
  // action toolbar stuck open after a tap/swipe.
  const setHoverIfMouse = (v: boolean) => (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") setHover(v);
  };

  // Anchor the menu near the same corner regardless of where inside a (maybe
  // large) message you right-clicked — otherwise it feels like it "jumps
  // around" depending on whether you clicked the text, an image, etc.
  function openMenuAnchored() {
    const r = rowRef.current?.getBoundingClientRect();
    setMenu(r ? { x: r.right - 8, y: r.top + 4 } : { x: 0, y: 0 });
  }

  // Parse markdown once per content change, not on every parent re-render.
  const body = useMemo(() => renderMarkdown(message.content, emojiMap), [message.content, emojiMap]);

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

  const bookmarked = useBookmarks((s) => s.bookmarks.some((b) => b.id === message.id));
  const menuItems: MenuItem[] = [
    { label: "View Profile", icon: "👤", onClick: () => openProfile(message.author.id) },
    { label: "Add Reaction", icon: "😀", onClick: () => setPicker(true) },
    { label: "Reply", icon: "↩️", onClick: () => onReply(message) },
    { label: "Copy Text", icon: "📋", onClick: () => navigator.clipboard?.writeText(message.content) },
    {
      label: bookmarked ? "Remove Bookmark" : "Bookmark",
      icon: "🔖",
      onClick: () => useBookmarks.getState().toggle(message, useUI.getState().currentGuildId),
    },
    { label: message.pinned ? "Unpin" : "Pin", icon: "📌", onClick: () => setPin(!message.pinned) },
    ...(mine
      ? [
          { label: "Edit", icon: "✏️", onClick: () => { setDraft(message.content); setEditing(true); } },
          { label: "Delete", icon: "🗑", danger: true, onClick: () => api(`/api/messages/${message.id}`, { method: "DELETE" }).catch(() => {}) },
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

  // Phones: swipe a message to the left → reply to it (long-press stays the
  // context menu). Successful swipes stop propagation so the global
  // drawer-gestures in AppLayout don't also fire.
  const swipeRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    swipeRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = swipeRef.current;
    swipeRef.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Date.now() - s.t > 500 || dx > -60 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
    e.stopPropagation();
    onReply(message);
  };

  function toggleReaction(emoji: string, at?: { x: number; y: number }) {
    setPicker(false);
    const mineReacted = (message.reactions ?? []).some((r) => r.emoji === emoji && r.userId === user?.id);
    const enc = encodeURIComponent(emoji);
    api(`/api/messages/${message.id}/reactions/${enc}`, { method: mineReacted ? "DELETE" : "PUT" }).catch(() => {});
    // Tiny celebratory burst where you clicked (only when adding).
    if (!mineReacted && at) {
      const now = Date.now();
      const parts = Array.from({ length: 6 }, (_, i) => ({
        id: now + i,
        x: at.x,
        y: at.y,
        emoji,
        dx: Math.round((Math.random() - 0.5) * 90),
        dy: -Math.round(30 + Math.random() * 60),
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
      onTouchEnd={onTouchEnd}
      onContextMenu={(e) => { e.preventDefault(); openMenuAnchored(); }}
      className={`group relative flex scroll-mt-6 gap-4 px-4 hover:bg-black/10 ${grouped ? "py-0.5" : "mt-3 py-0.5"} ${message.pinned ? "bg-yellow-500/5" : ""}`}
    >
      <div className="w-10 shrink-0">
        {!grouped ? (
          <button onClick={() => openProfile(message.author.id)} title="View profile" className="rounded-full">
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
            title="Jump to message"
          >
            <span className="text-discord-faint">↰</span>
            <strong>{message.replyTo.author.displayName ?? message.replyTo.author.username}</strong>{" "}
            <span className="truncate">{message.replyTo.content.slice(0, 80)}</span>
          </button>
        )}

        {message.pinned && <div className="mb-0.5 text-[10px] font-semibold text-yellow-500">📌 Pinned</div>}

        {editing ? (
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); }
              if (e.key === "Escape") setEditing(false);
            }}
            className="w-full resize-none rounded bg-discord-deep px-3 py-2 text-discord-text outline-none focus:ring-1 focus:ring-discord-accent"
          />
        ) : (
          message.content && (
            <div className="whitespace-pre-wrap break-words text-discord-text">
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
      </div>

      {hover && !editing && !menu && (
        <div className="absolute right-3 top-0 flex items-center gap-1 rounded bg-discord-rail shadow ring-1 ring-black/30">
          <button onClick={() => setPicker((p) => !p)} className="px-2 py-1 text-sm text-discord-muted hover:text-white" title="Add reaction">😀</button>
          <button onClick={() => onReply(message)} className="px-2 py-1 text-sm text-discord-muted hover:text-white" title="Reply">↩️</button>
          {mine && (
            <button onClick={() => { setDraft(message.content); setEditing(true); }} className="px-2 py-1 text-sm text-discord-muted hover:text-white" title="Edit">✏️</button>
          )}
          <button onClick={openMenuAnchored} className="px-2 py-1 text-sm text-discord-muted hover:text-white" title="More">⋯</button>
        </div>
      )}

      {picker && (
        <div className="absolute right-3 top-7 z-10 flex gap-1 rounded-lg bg-discord-rail p-1.5 shadow-xl">
          {QUICK_EMOJIS.map((e) => (
            <button
              key={e}
              onClick={(ev) => toggleReaction(e, { x: ev.clientX, y: ev.clientY })}
              className="rounded p-1 text-lg hover:bg-discord-hover"
            >
              {e}
            </button>
          ))}
        </div>
      )}

      {bursts.map((p) => (
        <span
          key={p.id}
          className="cc-burst pointer-events-none fixed z-[90] text-base"
          style={{ left: p.x, top: p.y, "--dx": `${p.dx}px`, "--dy": `${p.dy}px` } as React.CSSProperties}
        >
          {p.emoji}
        </span>
      ))}

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}
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
    return (
      <button
        type="button"
        onClick={() => useLightbox.getState().open(src, attachment.filename)}
        className="block cursor-zoom-in"
      >
        <img src={src} alt={attachment.filename} className="max-h-96 max-w-full rounded-lg object-contain" loading="lazy" />
      </button>
    );
  }
  if (isVideo) {
    return <video src={src} controls className="max-h-96 max-w-full rounded-lg" />;
  }
  if (isAudio) {
    return <audio src={src} controls className="w-72 max-w-full" />;
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
    a.grouped === b.grouped &&
    reactionSig(a.message) === reactionSig(b.message)
  );
});
