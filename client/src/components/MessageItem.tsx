import { memo, useMemo, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../store/auth";
import { serverPath } from "../lib/serverUrl";
import type { Attachment, Message } from "../types";
import Avatar from "./Avatar";
import { renderMarkdown } from "../lib/markdown";

function MessageItem({
  message,
  grouped,
}: {
  message: Message;
  grouped: boolean;
}) {
  const { user } = useAuth();
  const [hover, setHover] = useState(false);
  const [picker, setPicker] = useState(false);
  const mine = user?.id === message.author.id;
  const time = new Date(message.createdAt);

  // Parse markdown once per content change, not on every parent re-render.
  const body = useMemo(() => renderMarkdown(message.content), [message.content]);

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

  function toggleReaction(emoji: string) {
    setPicker(false);
    const mineReacted = (message.reactions ?? []).some((r) => r.emoji === emoji && r.userId === user?.id);
    const enc = encodeURIComponent(emoji);
    api(`/api/messages/${message.id}/reactions/${enc}`, { method: mineReacted ? "DELETE" : "PUT" }).catch(() => {});
  }

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`group relative flex gap-4 px-4 hover:bg-black/10 ${grouped ? "py-0.5" : "mt-3 py-0.5"}`}
    >
      <div className="w-10 shrink-0">
        {!grouped ? (
          <Avatar user={message.author} size={40} />
        ) : (
          <span className="hidden w-10 text-right text-[10px] leading-6 text-discord-faint group-hover:inline-block">
            {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <span className="font-medium text-white">
              {message.author.displayName ?? message.author.username}
            </span>
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
          <div className="mb-0.5 truncate text-xs text-discord-muted">
            ↰ <strong>{message.replyTo.author.displayName ?? message.replyTo.author.username}</strong>{" "}
            {message.replyTo.content.slice(0, 80)}
          </div>
        )}

        {message.content && (
          <div className="whitespace-pre-wrap break-words text-discord-text">
            {body}
            {message.editedAt && <span className="ml-1 text-[10px] text-discord-faint">(edited)</span>}
          </div>
        )}

        {message.attachments?.length > 0 && (
          <div className="mt-1 flex flex-col gap-2">
            {message.attachments.map((a) => (
              <AttachmentView key={a.id} attachment={a} />
            ))}
          </div>
        )}

        {reactionGroups.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {reactionGroups.map(([emoji, g]) => (
              <button
                key={emoji}
                onClick={() => toggleReaction(emoji)}
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

      {hover && (
        <div className="absolute right-3 top-0 flex items-center gap-1 rounded bg-discord-rail shadow">
          <button
            onClick={() => setPicker((p) => !p)}
            className="px-2 py-1 text-sm text-discord-muted hover:text-white"
            title="Add reaction"
          >
            😀
          </button>
          {mine && (
            <button
              onClick={() => api(`/api/messages/${message.id}`, { method: "DELETE" }).catch(() => {})}
              className="px-2 py-1 text-sm text-discord-muted hover:text-discord-danger"
              title="Delete"
            >
              🗑
            </button>
          )}
        </div>
      )}

      {picker && (
        <div className="absolute right-3 top-7 z-10 flex gap-1 rounded-lg bg-discord-rail p-1.5 shadow-xl">
          {QUICK_EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => toggleReaction(e)}
              className="rounded p-1 text-lg hover:bg-discord-hover"
            >
              {e}
            </button>
          ))}
        </div>
      )}
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
      <a href={src} target="_blank" rel="noreferrer">
        <img src={src} alt={attachment.filename} className="max-h-96 max-w-full rounded-lg object-contain" loading="lazy" />
      </a>
    );
  }
  if (isVideo) {
    return <video src={src} controls className="max-h-96 max-w-full rounded-lg" />;
  }
  if (isAudio) {
    return <audio src={src} controls className="w-72" />;
  }
  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      download
      className="flex w-fit max-w-md items-center gap-3 rounded-lg bg-discord-card px-3 py-2.5 hover:bg-discord-hover"
    >
      <span className="text-2xl">📄</span>
      <span className="min-w-0">
        <span className="block truncate text-sm text-[#00a8fc]">{attachment.filename}</span>
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
    a.grouped === b.grouped &&
    reactionSig(a.message) === reactionSig(b.message)
  );
});
