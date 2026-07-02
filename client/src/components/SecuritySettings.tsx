import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, tokens } from "../api/client";
import { useI18n } from "../lib/i18n";

interface Session {
  id: string;
  device: string | null;
  createdAt: string;
  current: boolean;
}

// Settings → Security: change password + active sessions (devices) with
// per-device sign-out. One live refresh token = one signed-in device.
export default function SecuritySettings() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data } = useQuery<{ sessions: Session[] }>({
    queryKey: ["sessions"],
    queryFn: () =>
      api<{ sessions: Session[] }>("/api/auth/sessions", {
        headers: tokens.refresh ? { "x-refresh-token": tokens.refresh } : undefined,
      }),
  });
  const sessions = data?.sessions ?? [];

  async function changePassword() {
    setMsg(null);
    if (next.length < 6) return setMsg(t("security.tooShort"));
    if (next !== confirm) return setMsg(t("security.mismatch"));
    setBusy(true);
    try {
      await api("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: cur, newPassword: next, refreshToken: tokens.refresh }),
      });
      setMsg(t("security.changed"));
      setCur("");
      setNext("");
      setConfirm("");
      qc.invalidateQueries({ queryKey: ["sessions"] });
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    await api(`/api/auth/sessions/${id}`, { method: "DELETE" }).catch(() => {});
    qc.invalidateQueries({ queryKey: ["sessions"] });
  }

  async function revokeOthers() {
    await api("/api/auth/sessions/revoke-others", {
      method: "POST",
      body: JSON.stringify({ refreshToken: tokens.refresh }),
    }).catch(() => {});
    qc.invalidateQueries({ queryKey: ["sessions"] });
  }

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 font-semibold text-white">{t("security.changePassword")}</h3>
        <div className="space-y-2">
          <input
            type="password"
            value={cur}
            onChange={(e) => setCur(e.target.value)}
            placeholder={t("security.current")}
            className="w-full rounded bg-discord-deep px-3 py-2 text-discord-text outline-none focus:ring-1 focus:ring-discord-accent"
          />
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder={t("security.new")}
            className="w-full rounded bg-discord-deep px-3 py-2 text-discord-text outline-none focus:ring-1 focus:ring-discord-accent"
          />
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={t("security.confirm")}
            className="w-full rounded bg-discord-deep px-3 py-2 text-discord-text outline-none focus:ring-1 focus:ring-discord-accent"
          />
          {msg && <div className="text-sm text-discord-muted">{msg}</div>}
          <button
            onClick={changePassword}
            disabled={busy || !cur || !next}
            className="rounded bg-discord-accent px-4 py-2 text-sm font-medium text-white hover:bg-discord-accentDark disabled:opacity-50"
          >
            {t("security.change")}
          </button>
          <p className="text-xs text-discord-faint">{t("security.changeNote")}</p>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold text-white">
            {t("security.sessions")} ({sessions.length})
          </h3>
          {sessions.length > 1 && (
            <button onClick={revokeOthers} className="rounded px-2 py-1 text-xs text-discord-danger hover:bg-discord-danger hover:text-white">
              {t("security.revokeOthers")}
            </button>
          )}
        </div>
        <div className="space-y-1.5">
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded bg-discord-card px-3 py-2 text-sm">
              <span className="text-lg">{/Android/.test(s.device ?? "") ? "📱" : "💻"}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-discord-text">
                  {s.device ?? t("security.unknownDevice")}
                  {s.current && <span className="ml-2 rounded bg-discord-green/20 px-1.5 text-[10px] font-semibold text-discord-green">{t("security.thisDevice")}</span>}
                </span>
                <span className="block text-xs text-discord-faint">{new Date(s.createdAt).toLocaleString()}</span>
              </span>
              {!s.current && (
                <button onClick={() => revoke(s.id)} className="shrink-0 rounded px-2 py-1 text-xs text-discord-muted hover:bg-discord-danger hover:text-white">
                  {t("security.signOut")}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
