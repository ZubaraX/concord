import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useUI } from "../store/ui";
import type { Guild } from "../types";
import Modal from "./Modal";

// Create a new server, or join an existing one via invite code/link.
export default function AddServerModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"create" | "join">("create");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();
  const { setGuild } = useUI();

  // Accept either a raw code or a full invite link (…/invite/<code>).
  const parseCode = (v: string) => v.trim().split(/[/\s]+/).filter(Boolean).pop() ?? "";

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const guild = await api<Guild>("/api/guilds", {
        method: "POST",
        body: JSON.stringify({ name: name.trim() }),
      });
      await qc.invalidateQueries({ queryKey: ["guilds"] });
      setGuild(guild.id);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function join() {
    const c = parseCode(code);
    if (!c) return;
    setBusy(true);
    setError(null);
    try {
      const { guild } = await api<{ guild: Guild }>(`/api/invites/${c}`, { method: "POST" });
      await qc.invalidateQueries({ queryKey: ["guilds"] });
      if (guild?.id) setGuild(guild.id);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={tab === "create" ? "Create a Server" : "Join a Server"} onClose={onClose}>
      <div className="mb-4 flex gap-2">
        <TabBtn active={tab === "create"} onClick={() => setTab("create")}>Create</TabBtn>
        <TabBtn active={tab === "join"} onClick={() => setTab("join")}>Join</TabBtn>
      </div>

      {tab === "create" ? (
        <>
          <label className="text-xs font-bold uppercase text-discord-muted">Server name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="My Awesome Server"
            className="mt-1.5 w-full rounded bg-discord-deep px-3 py-2.5 text-discord-text outline-none focus:ring-1 focus:ring-discord-accent"
          />
          <Footer error={error}>
            <button onClick={create} disabled={busy} className="primary">
              {busy ? "Creating…" : "Create"}
            </button>
          </Footer>
        </>
      ) : (
        <>
          <label className="text-xs font-bold uppercase text-discord-muted">Invite link or code</label>
          <input
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && join()}
            placeholder="abc123XY or http://localhost:4000/invite/abc123XY"
            className="mt-1.5 w-full rounded bg-discord-deep px-3 py-2.5 text-discord-text outline-none focus:ring-1 focus:ring-discord-accent"
          />
          <Footer error={error}>
            <button onClick={join} disabled={busy} className="primary">
              {busy ? "Joining…" : "Join Server"}
            </button>
          </Footer>
        </>
      )}
    </Modal>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-3 py-1.5 text-sm font-medium ${active ? "bg-discord-accent text-white" : "bg-discord-card text-discord-muted hover:text-white"}`}
    >
      {children}
    </button>
  );
}

function Footer({ error, children }: { error: string | null; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      {error && <div className="mb-2 text-sm text-discord-danger">{error}</div>}
      <div className="flex justify-end [&_.primary]:rounded [&_.primary]:bg-discord-accent [&_.primary]:px-5 [&_.primary]:py-2 [&_.primary]:font-medium [&_.primary]:text-white [&_.primary:hover]:bg-discord-accentDark [&_.primary:disabled]:opacity-60">
        {children}
      </div>
    </div>
  );
}
