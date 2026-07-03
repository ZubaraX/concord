import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useI18n } from "../lib/i18n";
import type { Guild, Role } from "../types";
import Modal from "./Modal";
import { PlusIcon, TrashIcon, ArrowUpIcon, ArrowDownIcon } from "./Icons";

// Only permissions the server actually enforces today are exposed here — a
// toggle for something unenforced would be a false sense of control.
const TOGGLES: { bit: bigint; key: string }[] = [
  { bit: 1n << 3n, key: "roles.perm.administrator" },
  { bit: 1n << 4n, key: "roles.perm.manageChannels" },
  { bit: 1n << 28n, key: "roles.perm.manageRoles" },
  { bit: 1n << 30n, key: "roles.perm.manageEmojis" },
];

const SWATCHES = ["#99aab5", "#1abc9c", "#2ecc71", "#3498db", "#9b59b6", "#e91e63", "#f1c40f", "#e67e22", "#e74c3c", "#95a5a6"];

export default function RolesModal({ guildId, onClose }: { guildId: string; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data: guild } = useQuery<Guild>({ queryKey: ["guild", guildId], enabled: false });
  const roles = [...(guild?.roles ?? [])].sort((a, b) => b.position - a.position);
  const [selectedId, setSelectedId] = useState<string | null>(roles[0]?.id ?? null);
  const selected = roles.find((r) => r.id === selectedId) ?? roles[0] ?? null;

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["guild", guildId] });
  }

  async function createRole() {
    const role = await api<Role>(`/api/guilds/${guildId}/roles`, { method: "POST", body: JSON.stringify({ name: t("roles.newRole") }) });
    invalidate();
    setSelectedId(role.id);
  }

  async function patchRole(roleId: string, patch: Partial<{ name: string; color: string; permissions: string }>) {
    await api(`/api/guilds/${guildId}/roles/${roleId}`, { method: "PATCH", body: JSON.stringify(patch) }).catch(() => {});
    invalidate();
  }

  async function deleteRole(roleId: string) {
    await api(`/api/guilds/${guildId}/roles/${roleId}`, { method: "DELETE" }).catch(() => {});
    setSelectedId(null);
    invalidate();
  }

  async function moveRole(roleId: string, direction: "up" | "down") {
    await api(`/api/guilds/${guildId}/roles/${roleId}/move`, { method: "POST", body: JSON.stringify({ direction }) }).catch(() => {});
    invalidate();
  }

  function togglePerm(role: Role, bit: bigint) {
    const cur = BigInt(role.permissions || "0");
    const next = cur & bit ? cur & ~bit : cur | bit;
    patchRole(role.id, { permissions: next.toString() });
  }

  return (
    <Modal title={`🛡 ${t("roles.title")}`} onClose={onClose} wide>
      <div className="flex gap-4">
        <div className="w-40 shrink-0 space-y-1">
          {roles.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelectedId(r.id)}
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${
                selected?.id === r.id ? "bg-discord-card text-white" : "text-discord-muted hover:bg-discord-hover"
              }`}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
              <span className="truncate">{r.name}</span>
            </button>
          ))}
          <button
            onClick={createRole}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-discord-muted hover:bg-discord-hover hover:text-white"
          >
            <PlusIcon size={14} /> {t("roles.create")}
          </button>
        </div>

        {selected && (
          <div className="min-w-0 flex-1 space-y-4">
            <div className="flex items-center gap-2">
              <input
                value={selected.name}
                disabled={selected.isDefault}
                onChange={(e) => patchRole(selected.id, { name: e.target.value })}
                className="min-w-0 flex-1 rounded bg-discord-deep px-3 py-2 text-discord-text outline-none focus:ring-1 focus:ring-discord-accent disabled:opacity-60"
              />
              <button onClick={() => moveRole(selected.id, "up")} title={t("roles.moveUp")} className="rounded p-1.5 text-discord-muted hover:bg-discord-hover hover:text-white">
                <ArrowUpIcon size={16} />
              </button>
              <button onClick={() => moveRole(selected.id, "down")} title={t("roles.moveDown")} className="rounded p-1.5 text-discord-muted hover:bg-discord-hover hover:text-white">
                <ArrowDownIcon size={16} />
              </button>
              {!selected.isDefault && (
                <button onClick={() => deleteRole(selected.id)} title={t("roles.delete")} className="rounded p-1.5 text-discord-muted hover:bg-discord-danger hover:text-white">
                  <TrashIcon size={16} />
                </button>
              )}
            </div>

            <div>
              <label className="text-xs font-bold uppercase text-discord-muted">{t("roles.color")}</label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {SWATCHES.map((c) => (
                  <button
                    key={c}
                    onClick={() => patchRole(selected.id, { color: c })}
                    className={`h-7 w-7 rounded-full ring-2 transition ${selected.color === c ? "ring-white" : "ring-transparent"}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold uppercase text-discord-muted">{t("roles.permissions")}</label>
              <div className="mt-1.5 space-y-1">
                {TOGGLES.map(({ bit, key }) => {
                  const on = (BigInt(selected.permissions || "0") & bit) === bit;
                  return (
                    <button
                      key={key}
                      onClick={() => togglePerm(selected, bit)}
                      className="flex w-full items-center justify-between rounded bg-discord-card px-3 py-2 text-sm text-discord-text hover:bg-discord-hover"
                    >
                      {t(key as never)}
                      <span className={`h-5 w-9 shrink-0 rounded-full transition ${on ? "bg-discord-accent" : "bg-discord-deep"}`}>
                        <span className={`block h-4 w-4 translate-y-0.5 rounded-full bg-white transition ${on ? "translate-x-4" : "translate-x-0.5"}`} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
