import { useState } from "react";
import { api } from "../api/client";
import { useI18n } from "../lib/i18n";
import type { UploadedFile } from "../api/client";
import Modal from "./Modal";

const PRESETS_MIN = [15, 60, 8 * 60];

export default function ScheduleComposeModal({
  channelId,
  content,
  attachments,
  onDone,
  onClose,
}: {
  channelId: string;
  content: string;
  attachments: UploadedFile[];
  onDone: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function schedule(sendAt: Date) {
    if (!content.trim() && attachments.length === 0) {
      setError(t("schedule.empty"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/api/channels/${channelId}/schedule`, {
        method: "POST",
        body: JSON.stringify({ content, attachments, sendAt: sendAt.toISOString() }),
      });
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title={`🕐 ${t("schedule.title")}`} onClose={onClose}>
      <div className="space-y-2">
        {PRESETS_MIN.map((m) => (
          <button
            key={m}
            disabled={busy}
            onClick={() => schedule(new Date(Date.now() + m * 60_000))}
            className="block w-full rounded bg-discord-card px-3 py-2 text-left text-sm text-discord-text hover:bg-discord-hover disabled:opacity-50"
          >
            {m < 60 ? t("schedule.inMinutes", { n: String(m) }) : t("schedule.inHours", { n: String(m / 60) })}
          </button>
        ))}
        <div className="flex items-center gap-2 pt-1">
          <input
            type="datetime-local"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            className="min-w-0 flex-1 rounded bg-discord-deep px-3 py-2 text-discord-text outline-none focus:ring-1 focus:ring-discord-accent"
          />
          <button
            disabled={busy || !custom}
            onClick={() => schedule(new Date(custom))}
            className="shrink-0 rounded bg-discord-accent px-4 py-2 text-sm font-medium text-white hover:bg-discord-accentDark disabled:opacity-50"
          >
            {t("schedule.set")}
          </button>
        </div>
        {error && <div className="text-sm text-discord-danger">{error}</div>}
      </div>
    </Modal>
  );
}
