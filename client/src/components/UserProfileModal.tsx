import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useUI } from "../store/ui";
import { useAuth } from "../store/auth";
import { joinVoice } from "../lib/voice";
import { useI18n } from "../lib/i18n";
import { PhoneIcon } from "./Icons";
import type { User } from "../types";
import Modal from "./Modal";
import Avatar from "./Avatar";

interface FullProfile extends User {
  bannerUrl?: string | null;
  accentColor?: string | null;
  bio?: string | null;
  createdAt?: string;
}

export default function UserProfileModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { user: me } = useAuth();
  const { t } = useI18n();
  const { openDM } = useUI();
  const qc = useQueryClient();
  const { data: u, isLoading } = useQuery<FullProfile>({
    queryKey: ["profile", userId],
    queryFn: () => api<FullProfile>(`/api/users/${userId}`),
  });

  const isMe = me?.id === userId;
  const accent = u?.accentColor || "#5865f2";

  async function message(call = false) {
    const dm = await api<{ id: string }>("/api/dms", { method: "POST", body: JSON.stringify({ userId }) }).catch(() => null);
    if (!dm) return;
    qc.invalidateQueries({ queryKey: ["dms"] });
    openDM(dm.id);
    if (call) joinVoice(dm.id);
    onClose();
  }

  return (
    <Modal title="" onClose={onClose}>
      {isLoading || !u ? (
        <div className="text-sm text-discord-muted">Loading…</div>
      ) : (
        <div>
          <div className="-mx-5 -mt-5 h-24 rounded-t-lg" style={{ background: u.bannerUrl ? `url(${u.bannerUrl}) center/cover` : accent }} />
          <div className="-mt-10 mb-3 flex items-end gap-3">
            <div className="rounded-full ring-4 ring-discord-bg">
              <Avatar user={u} size={80} status={u.status} />
            </div>
          </div>
          <div className="rounded-lg bg-discord-deep p-4">
            <div className="flex items-baseline gap-2">
              <div className="text-xl font-bold text-white">{u.displayName ?? u.username}</div>
              {u.pronouns && <div className="text-sm text-discord-faint">{u.pronouns}</div>}
            </div>
            <div className="text-sm text-discord-muted">{u.username}#{u.discriminator}</div>
            {u.customStatus && <div className="mt-2 text-sm text-discord-text">{u.customStatus}</div>}
            {u.bio && (
              <>
                <div className="mt-3 text-xs font-bold uppercase text-discord-muted">{t("profile.aboutMe")}</div>
                <div className="mt-1 whitespace-pre-wrap break-words text-sm text-discord-text">{u.bio}</div>
              </>
            )}
            {u.createdAt && (
              <>
                <div className="mt-3 text-xs font-bold uppercase text-discord-muted">{t("profile.memberSince")}</div>
                <div className="mt-1 text-sm text-discord-text">{new Date(u.createdAt).toLocaleDateString()}</div>
              </>
            )}
            {!isMe && (
              <div className="mt-4 flex gap-2">
                <button onClick={() => message(false)} className="flex-1 rounded bg-discord-accent py-2 text-sm font-medium text-white hover:bg-discord-accentDark">
                  💬 {t("profile.message")}
                </button>
                <button onClick={() => message(true)} className="flex flex-1 items-center justify-center gap-2 rounded bg-discord-green py-2 text-sm font-medium text-white hover:brightness-110">
                  <PhoneIcon size={16} /> {t("voice.call")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
