import { memo, useMemo, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../store/auth";
import type { Message } from "../types";
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
  const mine = user?.id === message.author.id;
  const time = new Date(message.createdAt);

  // Parse markdown once per content change, not on every parent re-render.
  const body = useMemo(() => renderMarkdown(message.content), [message.content]);

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

        <div className="whitespace-pre-wrap break-words text-discord-text">
          {body}
          {message.editedAt && <span className="ml-1 text-[10px] text-discord-faint">(edited)</span>}
        </div>
      </div>

      {hover && mine && (
        <button
          onClick={() => api(`/api/messages/${message.id}`, { method: "DELETE" }).catch(() => {})}
          className="absolute right-3 top-0 rounded bg-discord-rail px-2 py-1 text-xs text-discord-muted hover:text-discord-danger"
          title="Delete"
        >
          🗑
        </button>
      )}
    </div>
  );
}

// Re-render a message only when its identity, content, edit state, or grouping
// changes — not when sibling messages arrive.
export default memo(MessageItem, (a, b) => {
  return (
    a.message.id === b.message.id &&
    a.message.content === b.message.content &&
    a.message.editedAt === b.message.editedAt &&
    a.grouped === b.grouped
  );
});
