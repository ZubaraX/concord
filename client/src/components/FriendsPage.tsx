import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useUI } from "../store/ui";
import { joinVoice } from "../lib/voice";
import { useI18n } from "../lib/i18n";
import { UsersIcon, MessageIcon, PhoneIcon, CheckIcon, XIcon } from "./Icons";
import type { Friend, User } from "../types";
import Avatar from "./Avatar";

type Tab = "online" | "all" | "pending" | "add";
interface Pending {
  incoming: { id: string; user: User }[];
  outgoing: { id: string; user: User }[];
}

export default function FriendsPage() {
  const [tab, setTab] = useState<Tab>("online");
  const qc = useQueryClient();
  const { openDM } = useUI();
  const { t } = useI18n();

  const { data: friends = [] } = useQuery<Friend[]>({ queryKey: ["friends"], queryFn: () => api("/api/friends") });
  const { data: pending } = useQuery<Pending>({ queryKey: ["friends", "pending"], queryFn: () => api("/api/friends/pending") });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["friends"] });
    qc.invalidateQueries({ queryKey: ["dms"] });
  };

  async function openOrCreateDM(userId: string, andCall = false) {
    const dm = await api<{ id: string }>("/api/dms", { method: "POST", body: JSON.stringify({ userId }) });
    qc.invalidateQueries({ queryKey: ["dms"] });
    openDM(dm.id);
    if (andCall) joinVoice(dm.id);
  }

  const online = friends.filter((f) => f.user.status && f.user.status !== "OFFLINE");
  const list = tab === "online" ? online : friends;
  const pendingCount = pending?.incoming.length ?? 0;

  return (
    <main className="flex flex-1 flex-col bg-discord-bg">
      <header className="flex h-12 items-center gap-4 border-b border-black/20 px-4 shadow-sm">
        <span className="flex items-center gap-2 font-semibold text-white"><UsersIcon size={18} /> {t("friends.title")}</span>
        <div className="flex gap-1">
          <TabBtn active={tab === "online"} onClick={() => setTab("online")}>{t("friends.online")}</TabBtn>
          <TabBtn active={tab === "all"} onClick={() => setTab("all")}>{t("friends.all")}</TabBtn>
          <TabBtn active={tab === "pending"} onClick={() => setTab("pending")}>
            {t("friends.pending")}{pendingCount > 0 ? ` (${pendingCount})` : ""}
          </TabBtn>
          <button
            onClick={() => setTab("add")}
            className={`rounded px-3 py-1 text-sm font-medium ${tab === "add" ? "bg-discord-green text-white" : "bg-discord-green/80 text-white hover:bg-discord-green"}`}
          >
            {t("friends.addFriend")}
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === "add" ? (
          <AddFriend onDone={() => { setTab("pending"); refresh(); }} />
        ) : tab === "pending" ? (
          <PendingList pending={pending} onChange={refresh} />
        ) : list.length === 0 ? (
          <p className="text-discord-muted">{t("friends.empty")}</p>
        ) : (
          <div className="space-y-1">
            <h3 className="mb-2 text-xs font-bold uppercase text-discord-muted">
              {tab === "online" ? t("friends.online") : t("friends.all")} — {list.length}
            </h3>
            {list.map((f) => (
              <div key={f.id} className="flex items-center gap-3 rounded px-2 py-2 hover:bg-discord-hover">
                <Avatar user={f.user} size={36} status={f.user.status ?? "OFFLINE"} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-white">{f.user.displayName ?? f.user.username}</div>
                  <div className="truncate text-xs text-discord-muted">
                    {f.user.username}#{f.user.discriminator}
                  </div>
                </div>
                <IconBtn title={t("profile.message")} onClick={() => openOrCreateDM(f.user.id)}><MessageIcon size={16} /></IconBtn>
                <IconBtn title={t("voice.call")} onClick={() => openOrCreateDM(f.user.id, true)}><PhoneIcon size={16} /></IconBtn>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function AddFriend({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const [tag, setTag] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const m = tag.trim().match(/^(.+)#(\d{4})$/);
    if (!m) {
      setMsg({ ok: false, text: "Enter as username#0000 (4-digit tag)." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/friends/request", { method: "POST", body: JSON.stringify({ username: m[1], discriminator: m[2] }) });
      setMsg({ ok: true, text: "Friend request sent!" });
      setTag("");
      onDone();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-lg">
      <h3 className="text-base font-semibold text-white">{t("friends.addFriend")}</h3>
      <p className="mt-1 text-sm text-discord-muted">{t("friends.addPlaceholder")} — <code>demo#0001</code></p>
      <div className="mt-3 flex gap-2">
        <input
          autoFocus
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="username#0000"
          className="flex-1 rounded bg-discord-deep px-3 py-2.5 text-discord-text outline-none focus:ring-1 focus:ring-discord-accent"
        />
        <button onClick={submit} disabled={busy} className="rounded bg-discord-accent px-5 py-2 font-medium text-white hover:bg-discord-accentDark disabled:opacity-60">
          {t("friends.send")}
        </button>
      </div>
      {msg && <div className={`mt-2 text-sm ${msg.ok ? "text-discord-green" : "text-discord-danger"}`}>{msg.text}</div>}
    </div>
  );
}

function PendingList({ pending, onChange }: { pending?: Pending; onChange: () => void }) {
  const { t } = useI18n();
  if (!pending || (pending.incoming.length === 0 && pending.outgoing.length === 0)) {
    return <p className="text-discord-muted">{t("friends.empty")}</p>;
  }
  const accept = (id: string) => api(`/api/friends/${id}/accept`, { method: "POST" }).then(onChange);
  const remove = (id: string) => api(`/api/friends/${id}`, { method: "DELETE" }).then(onChange);

  return (
    <div className="space-y-4">
      {pending.incoming.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase text-discord-muted">Incoming — {pending.incoming.length}</h3>
          {pending.incoming.map((p) => (
            <Row key={p.id} user={p.user}>
              <IconBtn title={t("friends.accept")} onClick={() => accept(p.id)}><CheckIcon size={16} /></IconBtn>
              <IconBtn title={t("friends.decline")} onClick={() => remove(p.id)}><XIcon size={16} /></IconBtn>
            </Row>
          ))}
        </div>
      )}
      {pending.outgoing.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase text-discord-muted">Outgoing — {pending.outgoing.length}</h3>
          {pending.outgoing.map((p) => (
            <Row key={p.id} user={p.user}>
              <IconBtn title={t("friends.remove")} onClick={() => remove(p.id)}><XIcon size={16} /></IconBtn>
            </Row>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ user, children }: { user: User; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded px-2 py-2 hover:bg-discord-hover">
      <Avatar user={user} size={36} status={user.status ?? "OFFLINE"} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-white">{user.displayName ?? user.username}</div>
        <div className="truncate text-xs text-discord-muted">{user.username}#{user.discriminator}</div>
      </div>
      {children}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded px-3 py-1 text-sm font-medium ${active ? "bg-discord-card text-white" : "text-discord-muted hover:text-white"}`}>
      {children}
    </button>
  );
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title} className="flex h-9 w-9 items-center justify-center rounded-full bg-discord-rail text-discord-muted hover:text-white">
      {children}
    </button>
  );
}
