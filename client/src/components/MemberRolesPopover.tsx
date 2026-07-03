import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useI18n } from "../lib/i18n";
import type { Guild } from "../types";

// Small checklist popover (opened from a member's context menu) for toggling
// which roles a member holds. Requires MANAGE_ROLES — caller only renders the
// trigger when the current user has it; the server re-checks regardless.
export default function MemberRolesPopover({
  guildId,
  userId,
  x,
  y,
  onClose,
}: {
  guildId: string;
  userId: string;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const ref = useRef<HTMLDivElement>(null);
  const { data: guild } = useQuery<Guild>({ queryKey: ["guild", guildId], enabled: false });

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const id = setTimeout(() => window.addEventListener("mousedown", onDown), 0);
    return () => {
      clearTimeout(id);
      window.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  const roles = (guild?.roles ?? []).filter((r) => !r.isDefault);
  const member = guild?.members?.find((m) => m.user.id === userId);
  const memberRoleIds = new Set((member?.roles ?? []).map((r) => r.id));

  async function toggle(roleId: string, has: boolean) {
    await api(`/api/guilds/${guildId}/members/${userId}/roles/${roleId}`, { method: has ? "DELETE" : "POST" }).catch(() => {});
    qc.invalidateQueries({ queryKey: ["guild", guildId] });
  }

  const left = Math.min(x, window.innerWidth - 232);
  const top = Math.min(Math.max(y, 8), window.innerHeight - 260);

  return (
    <div
      ref={ref}
      style={{ left, top }}
      className="cc-pop fixed z-[80] w-56 rounded-lg bg-discord-rail p-2 shadow-panel ring-1 ring-black/50"
    >
      <div className="mb-1 px-1 text-xs font-semibold uppercase text-discord-muted">{t("roles.manageFor")}</div>
      {roles.length === 0 ? (
        <p className="px-1 py-2 text-sm text-discord-muted">{t("roles.none")}</p>
      ) : (
        <div className="max-h-56 space-y-0.5 overflow-y-auto">
          {roles.map((r) => {
            const has = memberRoleIds.has(r.id);
            return (
              <button
                key={r.id}
                onClick={() => toggle(r.id, has)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-discord-text hover:bg-discord-hover"
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${has ? "border-discord-accent bg-discord-accent" : "border-discord-faint"}`}
                >
                  {has && <span className="text-[10px] leading-none text-white">✓</span>}
                </span>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
                <span className="truncate">{r.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
