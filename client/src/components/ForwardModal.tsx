import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { useI18n } from "../lib/i18n";
import { useNotify } from "../store/notify";
import type { DMSummary, Guild, Message } from "../types";
import Modal from "./Modal";
import Avatar from "./Avatar";

interface Target {
  id: string;
  label: string;
  sub?: string;
  dm?: DMSummary;
}

// Forward a message's text + attachments into another channel or DM.
export default function ForwardModal({ message, onClose }: { message: Message; onClose: () => void }) {
  const { t } = useI18n();
  const [filter, setFilter] = useState("");
  const [sending, setSending] = useState<string | null>(null);

  const { data: guilds = [] } = useQuery<Guild[]>({ queryKey: ["guilds"], queryFn: () => api<Guild[]>("/api/guilds") });
  const { data: dms = [] } = useQuery<DMSummary[]>({ queryKey: ["dms"], queryFn: () => api<DMSummary[]>("/api/dms") });

  const targets = useMemo<Target[]>(() => {
    const list: Target[] = [];
    for (const g of guilds) {
      for (const c of g.channels ?? []) {
        if (c.type === "TEXT") list.push({ id: c.id, label: `#${c.name}`, sub: g.name });
      }
    }
    for (const d of dms) list.push({ id: d.id, label: d.name, sub: "ЛС", dm: d });
    const f = filter.trim().toLowerCase();
    return f ? list.filter((tt) => tt.label.toLowerCase().includes(f) || tt.sub?.toLowerCase().includes(f)) : list;
  }, [guilds, dms, filter]);

  async function forwardTo(target: Target) {
    setSending(target.id);
    try {
      await api(`/api/channels/${target.id}/messages`, {
        method: "POST",
        body: JSON.stringify({
          content: message.content,
          attachments: (message.attachments ?? []).map((a) => ({
            url: a.url,
            filename: a.filename,
            size: a.size,
            mimeType: a.mimeType,
            width: a.width ?? null,
            height: a.height ?? null,
          })),
        }),
      });
      useNotify.getState().push({ title: "✅", body: t("forward.done") });
      onClose();
    } catch (e) {
      useNotify.getState().push({ title: t("forward.title"), body: (e as Error).message });
      setSending(null);
    }
  }

  return (
    <Modal title={`↪️ ${t("forward.title")}`} onClose={onClose}>
      <div className="mb-2 truncate rounded bg-discord-card px-3 py-2 text-xs text-discord-muted">
        {message.content?.slice(0, 120) || (message.attachments?.length ? "📎 " + message.attachments[0].filename : "")}
      </div>
      <input
        autoFocus
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder={t("forward.search")}
        className="mb-2 w-full rounded bg-discord-deep px-3 py-2 text-sm text-discord-text outline-none focus:ring-1 focus:ring-discord-accent"
      />
      <div className="max-h-72 space-y-0.5 overflow-y-auto">
        {targets.map((tt) => (
          <button
            key={tt.id}
            disabled={!!sending}
            onClick={() => forwardTo(tt)}
            className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-discord-hover disabled:opacity-50"
          >
            {tt.dm ? <Avatar user={tt.dm.otherUser} size={24} /> : <span className="w-6 text-center text-discord-faint">#</span>}
            <span className="min-w-0 flex-1 truncate text-discord-text">{tt.label}</span>
            {tt.sub && <span className="shrink-0 text-xs text-discord-faint">{tt.sub}</span>}
            {sending === tt.id && <span className="text-xs text-discord-muted">…</span>}
          </button>
        ))}
        {targets.length === 0 && <p className="p-2 text-sm text-discord-muted">{t("forward.none")}</p>}
      </div>
    </Modal>
  );
}
