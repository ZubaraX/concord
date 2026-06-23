import { useRef, useState } from "react";
import { getSocket } from "../lib/socket";

// Message composer. Sends over the socket (low-latency); Enter to send,
// Shift+Enter for newline. Emits a throttled typing event.
export default function Composer({
  channelId,
  channelName,
}: {
  channelId: string;
  channelName: string;
}) {
  const [value, setValue] = useState("");
  const lastTyping = useRef(0);

  function send() {
    const content = value.trim();
    if (!content) return;
    getSocket()?.emit("message:send", { channelId, content });
    setValue("");
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
    <div className="flex items-end gap-3 rounded-lg bg-discord-input px-4 py-2.5">
      <button className="pb-1 text-2xl leading-none text-discord-muted hover:text-discord-text" title="Upload (coming soon)">
        ＋
      </button>
      <textarea
        rows={1}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={`Message #${channelName}`}
        className="max-h-48 flex-1 resize-none bg-transparent py-1 text-discord-text outline-none placeholder:text-discord-faint"
        style={{ height: "auto" }}
      />
    </div>
  );
}
