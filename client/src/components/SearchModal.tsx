import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { useUI } from "../store/ui";
import { useI18n } from "../lib/i18n";
import type { Message } from "../types";
import Modal from "./Modal";
import Avatar from "./Avatar";
import { jumpToMessage } from "./MessageItem";
import { SearchIcon } from "./Icons";

// Message search — the whole guild, or just this conversation for DMs.
// Debounced query against /api/search; a result click jumps to the message.
export default function SearchModal({
  guildId,
  channelId,
  onClose,
}: {
  guildId: string | null;
  channelId: string; // fallback scope for DMs
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { setChannel, openDM, currentChannelId } = useUI();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Message[]>([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const query = q.trim();
    if (query.length < 2) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const scope = guildId ? `guildId=${guildId}` : `channelId=${channelId}`;
        setResults(await api<Message[]>(`/api/search?q=${encodeURIComponent(query)}&${scope}`));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q, guildId, channelId]);

  function open(m: Message) {
    if (m.channelId !== currentChannelId) {
      if (guildId) setChannel(m.channelId);
      else openDM(m.channelId);
    }
    onClose();
    // Give the target channel a moment to load its history, then flash-jump.
    setTimeout(() => jumpToMessage(m.id), m.channelId === currentChannelId ? 50 : 600);
  }

  return (
    <Modal title={`🔍 ${t("search.title")}`} onClose={onClose}>
      <div className="mb-3 flex items-center gap-2 rounded-lg bg-discord-deep px-3 py-2">
        <SearchIcon size={16} className="shrink-0 text-discord-muted" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("search.placeholder")}
          className="w-full bg-transparent text-sm text-discord-text outline-none placeholder:text-discord-faint"
        />
      </div>

      {searching ? (
        <p className="text-sm text-discord-muted">…</p>
      ) : results.length === 0 ? (
        <p className="text-sm text-discord-muted">
          {q.trim().length < 2 ? t("search.hint") : t("search.empty")}
        </p>
      ) : (
        <div className="max-h-96 space-y-2 overflow-y-auto">
          {results.map((m) => (
            <button
              key={m.id}
              onClick={() => open(m)}
              className="flex w-full gap-3 rounded bg-discord-card p-2.5 text-left hover:bg-discord-hover"
              title={t("search.jump")}
            >
              <Avatar user={m.author} size={32} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="text-sm font-medium text-white">
                    {m.author.displayName ?? m.author.username}
                  </span>
                  <span className="text-[10px] text-discord-faint">
                    {new Date(m.createdAt).toLocaleString()}
                  </span>
                </span>
                <span className="line-clamp-2 break-words text-sm text-discord-text">{m.content}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
