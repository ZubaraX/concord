import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, tokens } from "../api/client";
import { serverPath } from "../lib/serverUrl";
import { useI18n } from "../lib/i18n";
import type { Guild, GuildEmoji } from "../types";
import Modal from "./Modal";
import { TrashIcon } from "./Icons";

// Upload/delete a guild's custom emoji (used as :name: in messages and shown
// in the emoji picker's "Custom" section). Requires MANAGE_EMOJIS server-side.
export default function EmojiManageModal({ guildId, onClose }: { guildId: string; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data: guild } = useQuery<Guild>({ queryKey: ["guild", guildId], enabled: false });
  const emojis = guild?.emojis ?? [];
  const fileInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["guild", guildId] });
  }

  async function upload(file: File) {
    const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (!cleanName) return setError(t("emoji.needName"));
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const headers = new Headers();
      if (tokens.access) headers.set("Authorization", `Bearer ${tokens.access}`);
      const res = await fetch(serverPath(`/api/guilds/${guildId}/emojis?name=${encodeURIComponent(cleanName)}`), {
        method: "POST",
        body: form,
        headers,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Upload failed (${res.status})`);
      }
      setName("");
      if (fileInput.current) fileInput.current.value = "";
      invalidate();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(emoji: GuildEmoji) {
    await api(`/api/guilds/${guildId}/emojis/${emoji.id}`, { method: "DELETE" }).catch(() => {});
    invalidate();
  }

  return (
    <Modal title={`😀 ${t("emoji.title")}`} onClose={onClose}>
      <div className="mb-4 flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("emoji.namePlaceholder")}
          maxLength={32}
          className="min-w-0 flex-1 rounded bg-discord-deep px-3 py-2 text-discord-text outline-none focus:ring-1 focus:ring-discord-accent"
        />
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
        <button
          onClick={() => fileInput.current?.click()}
          disabled={busy || !name.trim()}
          className="shrink-0 rounded bg-discord-accent px-4 py-2 text-sm font-medium text-white hover:bg-discord-accentDark disabled:opacity-50"
        >
          {busy ? "…" : t("emoji.upload")}
        </button>
      </div>
      {error && <div className="mb-3 text-sm text-discord-danger">{error}</div>}

      {emojis.length === 0 ? (
        <p className="text-sm text-discord-muted">{t("emoji.none")}</p>
      ) : (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {emojis.map((e) => (
            <div key={e.id} className="group relative flex flex-col items-center gap-1 rounded bg-discord-card p-2">
              <img src={serverPath(e.url)} alt={e.name} className="h-8 w-8 object-contain" />
              <span className="w-full truncate text-center text-[10px] text-discord-muted">:{e.name}:</span>
              <button
                onClick={() => remove(e)}
                className="absolute right-1 top-1 rounded bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100"
                title={t("roles.delete")}
              >
                <TrashIcon size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
