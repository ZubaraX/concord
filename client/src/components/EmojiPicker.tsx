import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { serverPath } from "../lib/serverUrl";
import type { Guild } from "../types";

// Curated emoji set (no heavy dependency). Grouped lightly for browsing.
const EMOJIS = [
  "😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇","🥰","😍","🤩",
  "😘","😗","😋","😛","😜","🤪","😝","😚","🤗","🤭","🤫","🤔","😐","😑","😶","🙄",
  "😏","😒","😬","🤥","😌","😔","😪","🤤","😴","😷","🤒","🤕","🤧","🥵","🥶","😎",
  "🤓","🧐","😕","😟","🙁","☹️","😮","😯","😲","😳","🥺","😦","😧","😨","😰","😥",
  "😢","😭","😱","😖","😣","😞","😓","😩","😫","🥱","😤","😡","😠","🤬","😈","💀",
  "💩","🤡","👻","👽","🤖","🎃","😺","🙀","👍","👎","👌","✌️","🤞","🤟","🤘","👈",
  "👉","👆","👇","✋","🖐️","🖖","👋","🤙","💪","🙏","✍️","💅","👏","🙌","👐","🤝",
  "❤️","🧡","💛","💚","💙","💜","🖤","🤍","💔","❣️","💕","💞","💓","💗","💖","💘",
  "🔥","✨","⭐","🌟","💯","✅","❌","❓","❗","💬","👀","🎉","🎊","🎈","🎁","🏆",
];

export default function EmojiPicker({
  onPick,
  onClose,
  guildId,
}: {
  onPick: (e: string) => void;
  onClose: () => void;
  guildId?: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Reuses the guild query already cached elsewhere — no extra fetch.
  const { data: guild } = useQuery<Guild>({ queryKey: ["guild", guildId], enabled: false });
  const customEmojis = guild?.emojis ?? [];

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="cc-pop absolute bottom-12 right-0 z-50 max-h-72 w-72 overflow-y-auto rounded-lg bg-discord-rail p-2 shadow-xl ring-1 ring-black/40"
    >
      {customEmojis.length > 0 && (
        <>
          <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-discord-faint">Custom</div>
          <div className="mb-1.5 grid grid-cols-8 gap-0.5 border-b border-black/20 pb-1.5">
            {customEmojis.map((e) => (
              <button
                key={e.id}
                onClick={() => onPick(`:${e.name}: `)}
                title={`:${e.name}:`}
                className="flex items-center justify-center rounded p-1 hover:bg-discord-hover"
              >
                <img src={serverPath(e.url)} alt={e.name} className="h-6 w-6 object-contain" />
              </button>
            ))}
          </div>
        </>
      )}
      <div className="grid grid-cols-8 gap-0.5">
        {EMOJIS.map((e, i) => (
          <button
            key={i}
            onClick={() => onPick(e)}
            className="rounded p-1 text-xl leading-none hover:bg-discord-hover"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
