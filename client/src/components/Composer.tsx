import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { getSocket } from "../lib/socket";
import { useI18n } from "../lib/i18n";
import { useUI } from "../store/ui";
import { searchEmoji } from "../lib/emojiNames";
import { PaperclipIcon, SmileIcon, XIcon } from "./Icons";
import type { UploadedFile } from "../api/client";
import type { Guild, Message } from "../types";
import EmojiPicker from "./EmojiPicker";
import GifPicker from "./GifPicker";
import Avatar from "./Avatar";

// One row in the @mention / :emoji: autocomplete popup.
interface AcItem {
  key: string;
  label: string;
  detail?: string;
  insert: string;
  avatar?: { username: string; displayName: string | null; avatarUrl: string | null };
}

interface SendPayload {
  channelId: string;
  content: string;
  attachments: UploadedFile[];
  replyToId?: string;
}

// Message composer: text, reply, attachments (upload/paste/drag-drop), emoji.
// Attachments are owned by ChatArea so drag-drop onto the whole area works.
export default function Composer({
  channelId,
  channelName,
  attachments,
  setAttachments,
  uploading,
  addFiles,
  replyingTo,
  onClearReply,
  onSend,
}: {
  channelId: string;
  channelName: string;
  attachments: UploadedFile[];
  setAttachments: (fn: (prev: UploadedFile[]) => UploadedFile[]) => void;
  uploading: boolean;
  addFiles: (files: FileList | File[]) => void;
  replyingTo: Message | null;
  onClearReply: () => void;
  onSend: (payload: SendPayload) => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const lastTyping = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  // ── @mention / :emoji: autocomplete ─────────────────────────────────────
  const { currentGuildId } = useUI();
  const [caret, setCaret] = useState(0);
  const [acIndex, setAcIndex] = useState(0);
  const [acDismissed, setAcDismissed] = useState(false);

  // Same query key as MemberList → served from cache, no extra fetch.
  const { data: guild } = useQuery<Guild>({
    queryKey: ["guild", currentGuildId],
    queryFn: () => api<Guild>(`/api/guilds/${currentGuildId}`),
    enabled: !!currentGuildId,
    staleTime: 60_000,
  });

  const ac = useMemo<{ start: number; items: AcItem[] } | null>(() => {
    if (acDismissed) return null;
    const upto = value.slice(0, caret);
    // Trigger char (@ or :) at start-of-line or after whitespace, then a
    // partial token the user is still typing.
    const m = /(^|\s)([@:])([\p{L}\p{N}_.+-]*)$/u.exec(upto);
    if (!m) return null;
    const [, , trigger, q] = m;
    const start = caret - q.length - 1; // index of the trigger char
    if (trigger === "@") {
      const members = guild?.members ?? [];
      if (!members.length) return null;
      const ql = q.toLowerCase();
      const items = members
        .filter(
          (mm) =>
            mm.user.username.toLowerCase().startsWith(ql) ||
            (mm.user.displayName ?? "").toLowerCase().startsWith(ql) ||
            (mm.nickname ?? "").toLowerCase().startsWith(ql)
        )
        .slice(0, 8)
        .map((mm) => ({
          key: mm.user.id,
          label: mm.user.displayName ?? mm.user.username,
          detail: `@${mm.user.username}`,
          insert: `@${mm.user.username} `, // username — that's what the server resolves
          avatar: mm.user,
        }));
      return items.length ? { start, items } : null;
    }
    if (q.length < 2) return null; // ":" alone is too noisy
    const items = searchEmoji(q)
      .slice(0, 8)
      .map(([name, ch]) => ({ key: name, label: `${ch}  :${name}:`, insert: `${ch} ` }));
    return items.length ? { start, items } : null;
  }, [value, caret, acDismissed, guild]);

  function applyAc(item: AcItem) {
    const next = value.slice(0, ac!.start) + item.insert + value.slice(caret);
    setValue(next);
    const pos = ac!.start + item.insert.length;
    setCaret(pos);
    setAcIndex(0);
    requestAnimationFrame(() => {
      const el = textarea.current;
      if (el) {
        el.focus();
        el.selectionStart = el.selectionEnd = pos;
      }
    });
  }

  function send() {
    const content = value.trim();
    if (!content && attachments.length === 0) return;
    onSend({ channelId, content, attachments, replyToId: replyingTo?.id });
    setValue("");
    setAttachments(() => []);
    onClearReply();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // While the autocomplete popup is open it owns navigation + Enter/Tab.
    if (ac) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setAcIndex((i) => (i + 1) % ac.items.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setAcIndex((i) => (i - 1 + ac.items.length) % ac.items.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        applyAc(ac.items[Math.min(acIndex, ac.items.length - 1)]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setAcDismissed(true);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(e.target.value);
    setCaret(e.target.selectionStart ?? e.target.value.length);
    setAcDismissed(false);
    setAcIndex(0);
    const now = Date.now();
    if (now - lastTyping.current > 2000) {
      lastTyping.current = now;
      getSocket()?.emit("typing:start", channelId);
    }
  }

  function sendGif(url: string) {
    setShowGif(false);
    onSend({ channelId, content: "", attachments: [{ url, filename: "giphy.gif", size: 0, mimeType: "image/gif" }], replyToId: replyingTo?.id });
    onClearReply();
  }

  function onPaste(e: React.ClipboardEvent) {
    const files = Array.from(e.clipboardData.files);
    if (files.length) {
      e.preventDefault();
      addFiles(files);
    }
  }

  function insertEmoji(emoji: string) {
    const el = textarea.current;
    if (!el) {
      setValue((v) => v + emoji);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    setValue(value.slice(0, start) + emoji + value.slice(end));
    setShowEmoji(false);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + emoji.length;
    });
  }

  return (
    <div className="relative rounded-lg bg-discord-input">
      {replyingTo && (
        <div className="flex items-center justify-between border-b border-black/20 px-4 py-1.5 text-xs text-discord-muted">
          <span className="truncate">
            {t("composer.replyingTo", { name: "" })}{" "}
            <strong className="text-discord-text">{replyingTo.author.displayName ?? replyingTo.author.username}</strong>
          </span>
          <button onClick={onClearReply} className="hover:text-white"><XIcon size={14} /></button>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-black/20 p-3">
          {attachments.map((a, i) => (
            <div key={i} className="flex items-center gap-2 rounded bg-discord-deep px-2 py-1 text-xs">
              <span className="max-w-[180px] truncate text-discord-text">{a.filename}</span>
              <button onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))} className="text-discord-muted hover:text-discord-danger"><XIcon size={14} /></button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-3 px-4 py-2.5">
        <input ref={fileInput} type="file" multiple hidden onChange={(e) => e.target.files && addFiles(e.target.files)} />
        <button
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
          className="pb-1.5 leading-none text-discord-muted hover:text-discord-text disabled:opacity-50"
          title={t("composer.uploadFile")}
        >
          {uploading ? <span className="text-2xl leading-none">…</span> : <PaperclipIcon size={22} />}
        </button>
        <textarea
          ref={textarea}
          rows={1}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onSelect={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
          placeholder={t("composer.message", { name: channelName })}
          className="max-h-48 flex-1 resize-none bg-transparent py-1 text-discord-text outline-none placeholder:text-discord-faint"
        />
        <button
          onClick={() => setShowGif((v) => !v)}
          className="pb-1 text-sm font-bold leading-none text-discord-muted hover:text-discord-text"
          title={t("composer.gif")}
        >
          GIF
        </button>
        <button
          onClick={() => setShowEmoji((v) => !v)}
          className="pb-1.5 leading-none text-discord-muted hover:text-discord-text"
          title={t("composer.emoji")}
        >
          <SmileIcon size={22} />
        </button>
        {showEmoji && <EmojiPicker onPick={insertEmoji} onClose={() => setShowEmoji(false)} />}
        {showGif && <GifPicker onPick={sendGif} onClose={() => setShowGif(false)} />}
      </div>

      {ac && (
        <div className="cc-pop absolute bottom-full left-0 z-50 mb-1 w-full max-w-sm overflow-hidden rounded-lg bg-discord-rail py-1 shadow-xl ring-1 ring-black/40">
          {ac.items.map((item, i) => (
            <button
              key={item.key}
              onMouseDown={(e) => { e.preventDefault(); applyAc(item); }}
              onMouseEnter={() => setAcIndex(i)}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                i === acIndex ? "bg-discord-accent/30 text-white" : "text-discord-text"
              }`}
            >
              {item.avatar && <Avatar user={item.avatar} size={22} />}
              <span className="truncate">{item.label}</span>
              {item.detail && <span className="ml-auto shrink-0 text-xs text-discord-faint">{item.detail}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
