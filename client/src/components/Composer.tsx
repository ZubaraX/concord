import { useRef, useState } from "react";
import { getSocket } from "../lib/socket";
import { uploadFile, type UploadedFile } from "../api/client";

// Message composer with file attachments (unlimited size). Enter to send,
// Shift+Enter for newline. Emits a throttled typing event.
export default function Composer({
  channelId,
  channelName,
}: {
  channelId: string;
  channelName: string;
}) {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const lastTyping = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  function send() {
    const content = value.trim();
    if (!content && attachments.length === 0) return;
    getSocket()?.emit("message:send", { channelId, content, attachments });
    setValue("");
    setAttachments([]);
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const uploaded = await Promise.all(Array.from(files).map((f) => uploadFile(f)));
      setAttachments((prev) => [...prev, ...uploaded]);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
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

  return (
    <div className="rounded-lg bg-discord-input">
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-black/20 p-3">
          {attachments.map((a, i) => (
            <div key={i} className="flex items-center gap-2 rounded bg-[#1e1f22] px-2 py-1 text-xs">
              <span className="max-w-[180px] truncate text-discord-text">{a.filename}</span>
              <span className="text-discord-faint">{prettySize(a.size)}</span>
              <button
                onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                className="text-discord-muted hover:text-discord-danger"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-end gap-3 px-4 py-2.5">
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => onFiles(e.target.files)}
        />
        <button
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
          className="pb-1 text-2xl leading-none text-discord-muted hover:text-discord-text disabled:opacity-50"
          title="Attach a file (no size limit)"
        >
          {uploading ? "…" : "＋"}
        </button>
        <textarea
          rows={1}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          placeholder={`Message #${channelName}`}
          className="max-h-48 flex-1 resize-none bg-transparent py-1 text-discord-text outline-none placeholder:text-discord-faint"
        />
      </div>
    </div>
  );
}

function prettySize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
