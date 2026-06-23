import { useState } from "react";
import { useAuth } from "../store/auth";
import { getServerUrl, setServerUrl } from "../lib/serverUrl";
import type { PresenceStatus } from "../types";
import Modal from "./Modal";
import Avatar from "./Avatar";

const STATUSES: PresenceStatus[] = ["ONLINE", "IDLE", "DND", "OFFLINE"];

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const { user, updateProfile, logout } = useAuth();
  const [tab, setTab] = useState<"profile" | "app">("profile");

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? "");
  const [accentColor, setAccentColor] = useState(user?.accentColor ?? "#5865f2");
  const [customStatus, setCustomStatus] = useState(user?.customStatus ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [status, setStatus] = useState<PresenceStatus>(user?.status ?? "ONLINE");

  const [server, setServer] = useState(getServerUrl());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!user) return null;

  async function saveProfile() {
    setBusy(true);
    setMsg(null);
    try {
      await updateProfile({
        displayName: displayName.trim() || user!.username,
        avatarUrl: avatarUrl.trim() || null,
        accentColor: accentColor || null,
        customStatus: customStatus.trim() || null,
        bio: bio.trim() || null,
        status,
      });
      setMsg("Saved ✓");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function saveServer() {
    setServerUrl(server);
    setMsg("Server URL saved — reconnect by reloading.");
  }

  return (
    <Modal title="Settings" onClose={onClose} wide>
      <div className="mb-5 flex gap-2 border-b border-black/20 pb-3">
        <Tab active={tab === "profile"} onClick={() => setTab("profile")}>My Profile</Tab>
        <Tab active={tab === "app"} onClick={() => setTab("app")}>App / Connection</Tab>
      </div>

      {tab === "profile" ? (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar user={{ username: user.username, displayName, avatarUrl }} size={64} status={status} />
            <div className="text-sm text-discord-muted">
              {user.username}#{user.discriminator}
            </div>
          </div>

          <Field label="Display name" value={displayName} onChange={setDisplayName} />
          <Field label="Avatar URL" value={avatarUrl} onChange={setAvatarUrl} placeholder="https://…/avatar.png" />
          <Field label="Custom status" value={customStatus} onChange={setCustomStatus} placeholder="Playing something" />

          <div>
            <label className="text-xs font-bold uppercase text-discord-muted">Status</label>
            <div className="mt-1.5 flex gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`rounded px-3 py-1.5 text-sm ${status === s ? "bg-discord-accent text-white" : "bg-discord-card text-discord-muted hover:text-white"}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold uppercase text-discord-muted">Accent color</label>
            <input
              type="color"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              className="mt-1.5 block h-10 w-20 cursor-pointer rounded bg-transparent"
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase text-discord-muted">About me</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              maxLength={4000}
              className="mt-1.5 w-full resize-none rounded bg-[#1e1f22] px-3 py-2 text-discord-text outline-none focus:ring-1 focus:ring-discord-accent"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={saveProfile}
              disabled={busy}
              className="rounded bg-discord-accent px-5 py-2 font-medium text-white hover:bg-[#4752c4] disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save Profile"}
            </button>
            {msg && <span className="text-sm text-discord-muted">{msg}</span>}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="Server URL" value={server} onChange={setServer} placeholder="https://…app.github.dev or http://localhost:4000" />
          <div className="flex items-center gap-3">
            <button onClick={saveServer} className="rounded bg-discord-accent px-5 py-2 font-medium text-white hover:bg-[#4752c4]">
              Save Server URL
            </button>
            {msg && <span className="text-sm text-discord-muted">{msg}</span>}
          </div>

          <hr className="border-black/20" />
          <button
            onClick={() => logout()}
            className="rounded bg-discord-danger px-5 py-2 font-medium text-white hover:bg-[#a12828]"
          >
            Log Out
          </button>
        </div>
      )}
    </Modal>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-3 py-1.5 text-sm font-medium ${active ? "bg-discord-card text-white" : "text-discord-muted hover:text-white"}`}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-xs font-bold uppercase text-discord-muted">{label}</label>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded bg-[#1e1f22] px-3 py-2.5 text-discord-text outline-none focus:ring-1 focus:ring-discord-accent"
      />
    </div>
  );
}
