import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useUI } from "../store/ui";
import { useI18n } from "../lib/i18n";
import type { Guild } from "../types";

interface InvitePreview {
  code: string;
  guild: { id: string; name: string; iconUrl: string | null; memberCount: number };
}

// An invite link in a message renders as a join card (like Discord) — one
// click joins the server, no copy-pasting codes.
export default function InviteCard({ code }: { code: string }) {
  const { t } = useI18n();
  const { setGuild } = useUI();
  const qc = useQueryClient();
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: invite, isError } = useQuery<InvitePreview>({
    queryKey: ["invite", code],
    queryFn: () => api<InvitePreview>(`/api/invites/${code}`),
    staleTime: 60_000,
    retry: false,
  });

  async function join() {
    setJoining(true);
    setError(null);
    try {
      const r = await api<{ guild: Guild }>(`/api/invites/${code}`, { method: "POST" });
      qc.invalidateQueries({ queryKey: ["guilds"] });
      setGuild(r.guild.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setJoining(false);
    }
  }

  if (isError) {
    return (
      <div className="mt-1 w-fit max-w-full rounded-lg bg-discord-card px-3 py-2 text-sm text-discord-muted">
        {t("invite.invalid")}
      </div>
    );
  }
  if (!invite) return null;

  return (
    <div className="mt-1 flex w-fit max-w-full items-center gap-3 rounded-lg border-l-4 border-discord-green bg-discord-card p-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-discord-accent text-lg font-bold text-white">
        {invite.guild.iconUrl ? (
          <img src={invite.guild.iconUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          invite.guild.name.slice(0, 1).toUpperCase()
        )}
      </div>
      <div className="min-w-0">
        <div className="text-xs text-discord-faint">{t("invite.youAreInvited")}</div>
        <div className="truncate font-semibold text-white">{invite.guild.name}</div>
        <div className="text-xs text-discord-muted">
          👥 {invite.guild.memberCount}
          {error && <span className="ml-2 text-discord-danger">{error}</span>}
        </div>
      </div>
      <button
        onClick={join}
        disabled={joining}
        className="ml-2 shrink-0 rounded bg-discord-green px-4 py-1.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-60"
      >
        {joining ? "…" : t("invite.join")}
      </button>
    </div>
  );
}
