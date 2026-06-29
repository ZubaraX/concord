import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import Modal from "./Modal";

// Replaces window.prompt (unsupported in Electron) with a real channel creator.
export default function CreateChannelModal({
  guildId,
  defaultType,
  parentId,
  onClose,
}: {
  guildId: string;
  defaultType: "TEXT" | "VOICE";
  parentId?: string;
  onClose: () => void;
}) {
  const [type, setType] = useState<"TEXT" | "VOICE">(defaultType);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();

  async function submit() {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/channels", {
        method: "POST",
        body: JSON.stringify({ guildId, name: n, type, parentId }),
      });
      await qc.invalidateQueries({ queryKey: ["guild", guildId] });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Create Channel" onClose={onClose}>
      <div className="mb-4 flex gap-2">
        <TypeBtn active={type === "TEXT"} onClick={() => setType("TEXT")}># Text</TypeBtn>
        <TypeBtn active={type === "VOICE"} onClick={() => setType("VOICE")}>🔊 Voice</TypeBtn>
      </div>

      <label className="text-xs font-bold uppercase text-discord-muted">Channel name</label>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder={type === "VOICE" ? "General" : "new-channel"}
        className="mt-1.5 w-full rounded bg-discord-deep px-3 py-2.5 text-discord-text outline-none focus:ring-1 focus:ring-discord-accent"
      />

      {error && <div className="mt-2 text-sm text-discord-danger">{error}</div>}

      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded px-4 py-2 text-sm text-discord-muted hover:underline">
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={busy || !name.trim()}
          className="rounded bg-discord-accent px-5 py-2 font-medium text-white hover:bg-discord-accentDark disabled:opacity-60"
        >
          {busy ? "Creating…" : "Create Channel"}
        </button>
      </div>
    </Modal>
  );
}

function TypeBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded px-3 py-2 text-sm font-medium ${active ? "bg-discord-accent text-white" : "bg-discord-card text-discord-muted hover:text-white"}`}
    >
      {children}
    </button>
  );
}
