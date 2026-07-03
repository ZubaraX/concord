import { useState } from "react";
import { api } from "../api/client";
import { useI18n } from "../lib/i18n";
import Modal from "./Modal";
import { XIcon } from "./Icons";

export default function PollComposeModal({ channelId, onClose }: { channelId: string; onClose: () => void }) {
  const { t } = useI18n();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setOption = (i: number, v: string) => setOptions((prev) => prev.map((o, j) => (j === i ? v : o)));
  const addOption = () => options.length < 10 && setOptions((prev) => [...prev, ""]);
  const removeOption = (i: number) => setOptions((prev) => prev.filter((_, j) => j !== i));

  async function create() {
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || cleanOptions.length < 2) {
      setError(t("poll.needTwo"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/api/channels/${channelId}/poll`, {
        method: "POST",
        body: JSON.stringify({ question: question.trim(), options: cleanOptions }),
      });
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title={`📊 ${t("poll.create")}`} onClose={onClose}>
      <div className="space-y-3">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t("poll.questionPlaceholder")}
          maxLength={300}
          className="w-full rounded bg-discord-deep px-3 py-2 text-discord-text outline-none focus:ring-1 focus:ring-discord-accent"
        />
        <div className="space-y-2">
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={o}
                onChange={(e) => setOption(i, e.target.value)}
                placeholder={t("poll.optionPlaceholder", { n: String(i + 1) })}
                maxLength={80}
                className="min-w-0 flex-1 rounded bg-discord-deep px-3 py-2 text-discord-text outline-none focus:ring-1 focus:ring-discord-accent"
              />
              {options.length > 2 && (
                <button onClick={() => removeOption(i)} className="shrink-0 text-discord-muted hover:text-discord-danger">
                  <XIcon size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
        {options.length < 10 && (
          <button onClick={addOption} className="text-sm text-discord-link hover:underline">
            + {t("poll.addOption")}
          </button>
        )}
        {error && <div className="text-sm text-discord-danger">{error}</div>}
        <button
          onClick={create}
          disabled={busy}
          className="rounded bg-discord-accent px-5 py-2 font-medium text-white hover:bg-discord-accentDark disabled:opacity-60"
        >
          {busy ? "…" : t("poll.create")}
        </button>
      </div>
    </Modal>
  );
}
