import { useEffect, useRef } from "react";

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

export default function EmojiPicker({ onPick, onClose }: { onPick: (e: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
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
      className="absolute bottom-12 right-0 z-50 grid max-h-64 w-72 grid-cols-8 gap-0.5 overflow-y-auto rounded-lg bg-discord-rail p-2 shadow-xl ring-1 ring-black/40"
    >
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
  );
}
