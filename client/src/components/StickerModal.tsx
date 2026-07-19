import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, tokens } from "../api/client";
import { serverPath } from "../lib/serverUrl";
import { useI18n } from "../lib/i18n";
import type { Guild, GuildSticker } from "../types";
import Modal from "./Modal";
import { TrashIcon } from "./Icons";

// Guild sticker packs. mode="pick": tap a sticker to send it into the channel
// (one-tap image message). mode="manage": upload/delete (MANAGE_EMOJIS).
export default function StickerModal({
  guildId,
  mode,
  channelId,
  onClose,
}: {
  guildId: string;
  mode: "pick" | "manage";
  channelId?: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data: guild } = useQuery<Guild>({ queryKey: ["guild", guildId], enabled: false });
  const stickers = guild?.stickers ?? [];
  const fileInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["guild", guildId] });
  }

  async function upload(file: File) {
    const cleanName = name.trim().slice(0, 40);
    if (!cleanName) return setError(t("sticker.needName"));
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const headers = new Headers();
      if (tokens.access) headers.set("Authorization", `Bearer ${tokens.access}`);
      const res = await fetch(serverPath(`/api/guilds/${guildId}/stickers?name=${encodeURIComponent(cleanName)}`), {
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

  async function remove(st: GuildSticker) {
    await api(`/api/guilds/${guildId}/stickers/${st.id}`, { method: "DELETE" }).catch(() => {});
    invalidate();
  }

  // Send: a sticker is a one-tap image message — the normal message pipeline
  // (socket broadcast, pushes, forwarding) handles it with zero new cases.
  async function send(st: GuildSticker) {
    if (!channelId || busy) return;
    setBusy(true);
    try {
      await api(`/api/channels/${channelId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          content: "",
          attachments: [{ url: st.url, filename: `sticker-${st.name}.png`, size: 0, mimeType: "image/png" }],
        }),
      });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`🩵 ${t("sticker.title")}`} onClose={onClose}>
      {mode === "manage" && (
        <>
          <div className="mb-4 flex items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("sticker.namePlaceholder")}
              maxLength={40}
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
        </>
      )}
      {mode === "pick" && error && <div className="mb-3 text-sm text-discord-danger">{error}</div>}

      {stickers.length === 0 ? (
        <p className="text-sm text-discord-muted">{t("sticker.none")}</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {stickers.map((s) => (
            <div key={s.id} className="group relative">
              <button
                onClick={() => (mode === "pick" ? send(s) : undefined)}
                disabled={busy && mode === "pick"}
                className={`flex w-full flex-col items-center gap-1 rounded-lg bg-discord-card p-2 ${
                  mode === "pick" ? "cursor-pointer hover:bg-discord-hover" : "cursor-default"
                }`}
              >
                <img src={serverPath(s.url)} alt={s.name} className="h-20 w-20 object-contain" loading="lazy" />
                <span className="w-full truncate text-center text-[11px] text-discord-muted">{s.name}</span>
              </button>
              {mode === "manage" && (
                <button
                  onClick={() => remove(s)}
                  className="absolute right-1 top-1 rounded bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100"
                  title={t("roles.delete")}
                >
                  <TrashIcon size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
