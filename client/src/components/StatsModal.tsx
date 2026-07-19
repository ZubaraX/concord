import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { useI18n } from "../lib/i18n";
import type { User } from "../types";
import Modal from "./Modal";
import Avatar from "./Avatar";

interface Stats {
  totalMessages: number;
  memberCount: number;
  channelCount: number;
  perDay: { day: string; count: number }[];
  topAuthors: { count: number; user: Pick<User, "id" | "username" | "displayName" | "avatarUrl"> | null }[];
}

// Server statistics: totals, a 14-day message bar chart, and the most active
// members of the last 30 days.
export default function StatsModal({ guildId, onClose }: { guildId: string; onClose: () => void }) {
  const { t, lang } = useI18n();
  const { data, isLoading } = useQuery<Stats>({
    queryKey: ["stats", guildId],
    queryFn: () => api<Stats>(`/api/guilds/${guildId}/stats`),
  });

  const max = Math.max(1, ...(data?.perDay.map((p) => p.count) ?? [1]));
  const dayLabel = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString(lang === "ru" ? "ru" : "en", { day: "numeric", month: "short" });

  return (
    <Modal title={`📊 ${t("stats.title")}`} onClose={onClose} wide>
      {isLoading || !data ? (
        <div className="py-8 text-center text-sm text-discord-muted">…</div>
      ) : (
        <div className="space-y-5">
          {/* Totals */}
          <div className="grid grid-cols-3 gap-2">
            <StatCard icon="💬" value={data.totalMessages} label={t("stats.messages")} />
            <StatCard icon="👥" value={data.memberCount} label={t("stats.members")} />
            <StatCard icon="#" value={data.channelCount} label={t("stats.channels")} />
          </div>

          {/* 14-day bar chart */}
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-discord-muted">{t("stats.perDay")}</h3>
            <div className="flex h-36 items-end gap-1 rounded-lg bg-discord-card/40 p-3 ring-1 ring-black/20">
              {data.perDay.map((p) => (
                <div key={p.day} className="group relative flex min-w-0 flex-1 flex-col items-center justify-end gap-1 self-stretch">
                  <span className="text-[9px] tabular-nums text-discord-faint opacity-0 transition group-hover:opacity-100">
                    {p.count}
                  </span>
                  <div
                    className="w-full rounded-t bg-discord-accent transition-all"
                    style={{ height: `${Math.max(3, Math.round((p.count / max) * 100))}%`, opacity: p.count === 0 ? 0.25 : 1 }}
                    title={`${dayLabel(p.day)}: ${p.count}`}
                  />
                  <span className="w-full truncate text-center text-[8px] text-discord-faint">{dayLabel(p.day).split(" ")[0]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top authors */}
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-discord-muted">{t("stats.topAuthors")}</h3>
            {data.topAuthors.length === 0 ? (
              <p className="text-sm text-discord-muted">{t("stats.noData")}</p>
            ) : (
              <div className="space-y-1.5">
                {data.topAuthors.map((a, i) => {
                  const topMax = data.topAuthors[0]?.count || 1;
                  return (
                    <div key={a.user?.id ?? i} className="flex items-center gap-2.5 rounded-lg bg-discord-card/40 px-3 py-2 ring-1 ring-black/20">
                      <span className="w-5 text-center text-sm">{["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`}</span>
                      {a.user && <Avatar user={a.user as User} size={28} />}
                      <span className="min-w-0 flex-1 truncate text-sm text-discord-text">
                        {a.user ? a.user.displayName ?? a.user.username : "—"}
                      </span>
                      <div className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-discord-deep sm:block">
                        <div className="h-full rounded-full bg-discord-accent" style={{ width: `${Math.round((a.count / topMax) * 100)}%` }} />
                      </div>
                      <span className="shrink-0 text-xs tabular-nums text-discord-muted">{a.count}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="mt-1.5 text-[11px] text-discord-faint">{t("stats.hint")}</p>
          </div>
        </div>
      )}
    </Modal>
  );
}

function StatCard({ icon, value, label }: { icon: string; value: number; label: string }) {
  return (
    <div className="rounded-lg bg-discord-card/40 p-3 text-center ring-1 ring-black/20">
      <div className="text-lg">{icon}</div>
      <div className="text-xl font-bold tabular-nums text-white">{value.toLocaleString()}</div>
      <div className="text-[11px] text-discord-muted">{label}</div>
    </div>
  );
}
