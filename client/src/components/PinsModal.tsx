import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Message } from "../types";
import Modal from "./Modal";
import Avatar from "./Avatar";

export default function PinsModal({ channelId, onClose }: { channelId: string; onClose: () => void }) {
  const { data: pins = [], isLoading } = useQuery<Message[]>({
    queryKey: ["pins", channelId],
    queryFn: () => api<Message[]>(`/api/channels/${channelId}/pins`),
  });

  function unpin(id: string) {
    api(`/api/messages/${id}/pin`, { method: "DELETE" }).catch(() => {});
  }

  return (
    <Modal title="Pinned Messages" onClose={onClose}>
      {isLoading ? (
        <p className="text-sm text-discord-muted">Loading…</p>
      ) : pins.length === 0 ? (
        <p className="text-sm text-discord-muted">No pinned messages yet. Right-click a message → Pin.</p>
      ) : (
        <div className="space-y-3">
          {pins.map((m) => (
            <div key={m.id} className="group flex gap-3 rounded bg-discord-card p-2.5">
              <Avatar user={m.author} size={36} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium text-white">{m.author.displayName ?? m.author.username}</span>
                  <span className="text-[10px] text-discord-faint">{new Date(m.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="whitespace-pre-wrap break-words text-sm text-discord-text">{m.content}</div>
                {m.attachments?.length > 0 && <div className="mt-1 text-xs text-discord-muted">📎 {m.attachments.length} attachment(s)</div>}
              </div>
              <button onClick={() => unpin(m.id)} className="self-start text-discord-muted opacity-0 transition group-hover:opacity-100 hover:text-discord-danger" title="Unpin">✕</button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
