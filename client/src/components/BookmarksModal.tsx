import { useBookmarks } from "../store/bookmarks";
import { useUI } from "../store/ui";
import { jumpToMessage } from "./MessageItem";
import Modal from "./Modal";

// Locally saved messages (right-click a message → Bookmark). Clicking one
// navigates to its channel and flash-jumps to the message once it's rendered.
export default function BookmarksModal({ onClose }: { onClose: () => void }) {
  const { bookmarks, remove } = useBookmarks();
  const { setGuild, setChannel, openDM } = useUI();

  function open(b: { guildId: string | null; channelId: string; id: string }) {
    if (b.guildId) {
      setGuild(b.guildId);
      setChannel(b.channelId);
    } else {
      openDM(b.channelId);
    }
    onClose();
    // The channel needs a moment to load its history before we can jump.
    setTimeout(() => jumpToMessage(b.id), 600);
  }

  return (
    <Modal title="🔖 Bookmarks" onClose={onClose}>
      {bookmarks.length === 0 ? (
        <p className="text-sm text-discord-muted">No bookmarks yet. Right-click a message → Bookmark.</p>
      ) : (
        <div className="space-y-3">
          {bookmarks.map((b) => (
            <div key={b.id} className="group flex gap-3 rounded bg-discord-card p-2.5">
              <button onClick={() => open(b)} className="min-w-0 flex-1 text-left" title="Jump to message">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium text-white">{b.authorName}</span>
                  <span className="text-[10px] text-discord-faint">{new Date(b.createdAt).toLocaleString()}</span>
                </div>
                <div className="line-clamp-3 whitespace-pre-wrap break-words text-sm text-discord-text">{b.content}</div>
              </button>
              <button
                onClick={() => remove(b.id)}
                className="self-start text-discord-muted transition hover:text-discord-danger"
                title="Remove bookmark"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
