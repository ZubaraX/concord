import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useVoice } from "../store/voice";
import { useVoiceVolumes, screenVolKey } from "../store/voiceVolumes";
import { useScreenView } from "../store/screenView";
import { useUI } from "../store/ui";
import { useNotify } from "../store/notify";
import { joinVoice } from "../lib/voice";
import { useI18n } from "../lib/i18n";
import Avatar from "./Avatar";
import {
  SpeakerIcon,
  ScreenIcon,
  EyeIcon,
  EyeOffIcon,
  UserIcon,
  MessageIcon,
  PhoneIcon,
  UserPlusIcon,
  CopyIcon,
} from "./Icons";
import type { User } from "../types";

// Per-user controls for someone in the current call — opened by clicking their
// row in the voice-channel list. Volume + screen-audio volume + hide-screen +
// actions, all local-only. Positioned near the click and closes on outside/Esc.
export default function VoiceUserPopover({
  userId,
  x,
  y,
  onClose,
}: {
  userId: string;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { openProfile, openDM } = useUI();
  const ref = useRef<HTMLDivElement>(null);

  const entry = useVoice((s) => s.remotes.find((r) => r.userId === userId));
  const isSharing = !!entry?.screen;
  const hasScreenAudio = isSharing && entry!.screen!.getAudioTracks().length > 0;

  const volumes = useVoiceVolumes((s) => s.volumes);
  const setVolume = useVoiceVolumes((s) => s.setVolume);
  const voiceVol = volumes[userId] ?? 100;
  const screenVol = volumes[screenVolKey(userId)] ?? 100;

  const screenHidden = useScreenView((s) => !!s.hidden[userId]);
  const toggleScreen = useScreenView((s) => s.toggle);

  const { data: user } = useQuery<User>({
    queryKey: ["profile", userId],
    queryFn: () => api<User>(`/api/users/${userId}`),
    staleTime: 5 * 60_000,
  });
  const name = user?.displayName ?? user?.username ?? "…";

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const id = setTimeout(() => window.addEventListener("mousedown", onDown), 0);
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(id);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  async function openDMWith(call = false) {
    try {
      const dm = await api<{ id: string }>("/api/dms", { method: "POST", body: JSON.stringify({ userId }) });
      qc.invalidateQueries({ queryKey: ["dms"] });
      openDM(dm.id);
      if (call) joinVoice(dm.id);
    } catch (e) {
      useNotify.getState().push({ title: "Can't open DM", body: (e as Error).message });
    }
    onClose();
  }

  function addFriend() {
    if (user)
      api("/api/friends/request", {
        method: "POST",
        body: JSON.stringify({ username: user.username, discriminator: user.discriminator }),
      })
        .then(() => useNotify.getState().push({ title: "Friend request sent", body: name }))
        .catch((e) => useNotify.getState().push({ title: "Couldn't add friend", body: (e as Error).message }));
    onClose();
  }

  const left = Math.min(x, window.innerWidth - 252);
  const top = Math.min(Math.max(y, 8), window.innerHeight - 300);

  return (
    <div
      ref={ref}
      style={{ left, top }}
      className="fixed z-[80] w-60 rounded-lg bg-discord-rail p-3 shadow-panel ring-1 ring-black/50"
    >
      <div className="mb-2 flex items-center gap-2">
        <Avatar user={user ?? { username: "?", displayName: name, avatarUrl: null }} size={30} status={user?.status ?? "ONLINE"} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{name}</span>
      </div>

      {/* Voice volume */}
      <label className="flex items-center justify-between text-xs text-discord-muted">
        <span>{t("voice.userVolume")}</span>
        <span className="tabular-nums">{voiceVol}%</span>
      </label>
      <div className="mb-2 flex items-center gap-2">
        <SpeakerIcon size={13} className="shrink-0 text-discord-faint" />
        <input
          type="range"
          min={0}
          max={200}
          value={voiceVol}
          onChange={(e) => setVolume(userId, Number(e.target.value))}
          className="h-1.5 w-full accent-discord-accent"
        />
      </div>

      {isSharing && (
        <>
          <button
            onClick={() => toggleScreen(userId)}
            className="mb-2 flex w-full items-center gap-2 rounded bg-discord-card px-2 py-1.5 text-xs text-discord-text hover:bg-discord-hover"
          >
            {screenHidden ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
            {screenHidden ? t("voice.showScreen") : t("voice.hideScreen")}
          </button>
          {hasScreenAudio && !screenHidden && (
            <>
              <label className="flex items-center justify-between text-xs text-discord-muted">
                <span>{t("voice.screenVolume")}</span>
                <span className="tabular-nums">{screenVol}%</span>
              </label>
              <div className="mb-2 flex items-center gap-2">
                <ScreenIcon size={13} className="shrink-0 text-discord-green" />
                <input
                  type="range"
                  min={0}
                  max={200}
                  value={screenVol}
                  onChange={(e) => setVolume(screenVolKey(userId), Number(e.target.value))}
                  className="h-1.5 w-full accent-discord-green"
                />
              </div>
            </>
          )}
        </>
      )}

      <div className="mt-1 space-y-0.5 border-t border-black/20 pt-2 text-sm">
        <PopBtn icon={<UserIcon size={15} />} label={t("profile.viewProfile")} onClick={() => { openProfile(userId); onClose(); }} />
        <PopBtn icon={<MessageIcon size={15} />} label={t("profile.message")} onClick={() => openDMWith(false)} />
        <PopBtn icon={<PhoneIcon size={15} />} label={t("voice.call")} onClick={() => openDMWith(true)} />
        <PopBtn icon={<UserPlusIcon size={15} />} label={t("friends.addFriend")} onClick={addFriend} />
        <PopBtn icon={<CopyIcon size={15} />} label={t("common.copy") + " ID"} onClick={() => { navigator.clipboard?.writeText(userId); onClose(); }} />
      </div>
    </div>
  );
}

function PopBtn({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-discord-text hover:bg-discord-accent hover:text-white"
    >
      <span className="flex w-4 justify-center">{icon}</span>
      {label}
    </button>
  );
}
