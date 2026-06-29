import { useRef, useState } from "react";
import { getSocket } from "../lib/socket";
import { useI18n } from "../lib/i18n";
import type { UploadedFile } from "../api/client";
import type { Message } from "../types";
import EmojiPicker from "./EmojiPicker";
import GifPicker from "./GifPicker";

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

  function send() {
    const content = value.trim();
    if (!content && attachments.length === 0) return;
    onSend({ channelId, content, attachments, replyToId: replyingTo?.id });
    setValue("");
    setAttachments(() => []);
    onClearReply();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(e.target.value);
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
          <button onClick={onClearReply} className="hover:text-white">✕</button>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-black/20 p-3">
          {attachments.map((a, i) => (
            <div key={i} className="flex items-center gap-2 rounded bg-discord-deep px-2 py-1 text-xs">
              <span className="max-w-[180px] truncate text-discord-text">{a.filename}</span>
              <button onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))} className="text-discord-muted hover:text-discord-danger">✕</button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-3 px-4 py-2.5">
        <input ref={fileInput} type="file" multiple hidden onChange={(e) => e.target.files && addFiles(e.target.files)} />
        <button
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
          className="pb-1 text-2xl leading-none text-discord-muted hover:text-discord-text disabled:opacity-50"
          title={t("composer.uploadFile")}
        >
          {uploading ? "…" : "＋"}
        </button>
        <textarea
          ref={textarea}
          rows={1}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
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
          className="pb-1 text-xl leading-none text-discord-muted hover:text-discord-text"
          title={t("composer.emoji")}
        >
          😀
        </button>
        {showEmoji && <EmojiPicker onPick={insertEmoji} onClose={() => setShowEmoji(false)} />}
        {showGif && <GifPicker onPick={sendGif} onClose={() => setShowGif(false)} />}
      </div>
    </div>
  );
}
