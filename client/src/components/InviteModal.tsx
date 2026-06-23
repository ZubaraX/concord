import { useEffect, useState } from "react";
import { api } from "../api/client";
import { getServerUrl } from "../lib/serverUrl";
import { useUI } from "../store/ui";
import Modal from "./Modal";

// Generates an invite code for the current guild and shows a copyable link.
export default function InviteModal({ onClose }: { onClose: () => void }) {
  const { currentGuildId } = useUI();
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!currentGuildId) return;
    api<{ code: string }>(`/api/guilds/${currentGuildId}/invites`, { method: "POST" })
      .then((r) => setCode(r.code))
      .catch((e) => setError((e as Error).message));
  }, [currentGuildId]);

  // Link works both for the web client and as a code to paste into the desktop app.
  const base = getServerUrl() || window.location.origin;
  const link = code ? `${base}/invite/${code}` : "";

  function copy() {
    navigator.clipboard?.writeText(link || code || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Modal title="Invite People" onClose={onClose}>
      <p className="mb-3 text-sm text-discord-muted">
        Share this link (or just the code) so others can join. It never expires and has unlimited uses.
      </p>
      {error && <div className="text-sm text-discord-danger">{error}</div>}
      {!code && !error && <div className="text-sm text-discord-muted">Generating…</div>}
      {code && (
        <>
          <div className="flex gap-2">
            <input
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 rounded bg-[#1e1f22] px-3 py-2.5 text-discord-text outline-none"
            />
            <button onClick={copy} className="rounded bg-discord-accent px-5 py-2 font-medium text-white hover:bg-[#4752c4]">
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <div className="mt-2 text-xs text-discord-faint">
            Code: <code className="text-discord-text">{code}</code>
          </div>
        </>
      )}
    </Modal>
  );
}
