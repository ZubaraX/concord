import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { useVoice } from "../store/voice";
import { useAuth } from "../store/auth";
import {
  joinVoice,
  leaveVoice,
  toggleMute,
  toggleDeafen,
  toggleScreen,
  toggleCamera,
  flipCamera,
  sendVoiceEmoji,
  getMicStream,
} from "../lib/voice";
import { useSpeaking, type SpeakStream } from "../lib/speaking";
import { isAndroidApp } from "../lib/platform";
import { useI18n } from "../lib/i18n";
import type { Guild, User } from "../types";
import Avatar from "./Avatar";
import {
  MicIcon,
  MicOffIcon,
  CameraIcon,
  FlipCameraIcon,
  ScreenIcon,
  PhoneIcon,
  PhoneOffIcon,
  SmileIcon,
  HeadphonesIcon,
  HeadphonesOffIcon,
  ExpandIcon,
  XIcon,
} from "./Icons";
// Not imported from ChannelSidebar — that would make a circular import
// (ChannelSidebar pulls CallTimer from here).
const CALL_EMOJIS = ["👍", "❤️", "😂", "🎉", "😮", "🔥"];

// Discord-style voice channel stage: participant tiles (avatar or camera,
// green ring while speaking), screen shares as wide tiles, big controls at the
// bottom. Audio playback stays in VoiceOverlay's always-mounted sinks; every
// <video> here is muted.

/** Live mm:ss (or h:mm:ss) since joining the call. */
export function CallTimer({ className }: { className?: string }) {
  const joinedAt = useVoice((s) => s.joinedAt);
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);
  if (!joinedAt) return null;
  const total = Math.max(0, Math.floor((Date.now() - joinedAt) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const text = h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
  return <span className={clsx("tabular-nums", className)}>{text}</span>;
}

function VideoEl({ stream, className }: { stream: MediaStream; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream;
      ref.current.muted = true; // audio plays via the global sinks
    }
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted className={className} />;
}

export default function VoiceStage({
  channelId,
  channelName,
  guildId,
}: {
  channelId: string;
  channelName: string;
  guildId: string | null;
}) {
  const { t } = useI18n();
  const voice = useVoice();
  const me = useAuth((s) => s.user);
  const inCall = voice.channelId === channelId;
  const userIds = voice.occupancy[channelId] ?? [];
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [expanded, setExpanded] = useState<{ stream: MediaStream; label: string } | null>(null);

  // While the stage shows OUR live call, the floating mini-tiles are redundant.
  useEffect(() => {
    useVoice.getState().set({ stageOpen: inCall });
    return () => useVoice.getState().set({ stageOpen: false });
  }, [inCall]);

  const { data: guild } = useQuery<Guild>({
    queryKey: ["guild", guildId],
    queryFn: () => api<Guild>(`/api/guilds/${guildId}`),
    enabled: !!guildId,
    staleTime: 60_000,
  });
  const userOf = (uid: string): Pick<User, "username" | "displayName" | "avatarUrl"> => {
    if (uid === me?.id && me) return me;
    const m = guild?.members?.find((mm) => mm.user.id === uid);
    return m?.user ?? { username: "?", displayName: t("common.someone"), avatarUrl: null };
  };
  const nameOf = (uid: string) => {
    const u = userOf(uid);
    return u.displayName ?? u.username;
  };

  // Who's talking (remote audio + own mic) → green ring on tiles.
  const speakStreams = useMemo<SpeakStream[]>(() => {
    const arr: SpeakStream[] = voice.remotes.filter((r) => r.audio).map((r) => ({ id: r.userId, stream: r.audio! }));
    const mic = getMicStream();
    if (mic && me?.id) arr.push({ id: me.id, stream: mic, enabled: !voice.muted && !voice.deafened });
    return arr;
  }, [voice.remotes, voice.muted, voice.deafened, me?.id]);
  const speaking = useSpeaking(inCall ? speakStreams : []);

  const remoteOf = (uid: string) => voice.remotes.find((r) => r.userId === uid);

  // Screen shares (wide tiles): mine first, then remotes.
  const screens: { key: string; stream: MediaStream; label: string }[] = [];
  if (inCall && voice.screenOn && voice.localScreen) {
    screens.push({ key: "self", stream: voice.localScreen, label: `🖥 ${me?.displayName ?? me?.username ?? ""}` });
  }
  if (inCall) {
    for (const r of voice.remotes) {
      if (r.screen) screens.push({ key: r.socketId, stream: r.screen, label: `🖥 ${nameOf(r.userId)}` });
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-black/30">
      <div className="flex-1 overflow-y-auto p-4">
        {userIds.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-discord-muted">
            <span className="text-4xl">🔊</span>
            <p>{t("voice.stageEmpty")}</p>
          </div>
        )}

        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-3 md:grid-cols-3">
          {screens.map((s) => (
            <button
              key={s.key}
              onClick={() => setExpanded({ stream: s.stream, label: s.label })}
              className="group relative col-span-2 overflow-hidden rounded-xl bg-black ring-1 ring-black/40 md:col-span-3"
              title={s.label}
            >
              <VideoEl stream={s.stream} className="max-h-[48vh] min-h-40 w-full object-contain" />
              <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">{s.label}</span>
              <span className="cc-touch-show absolute right-2 top-2 rounded bg-black/60 p-1.5 text-white opacity-0 transition group-hover:opacity-100">
                <ExpandIcon size={14} />
              </span>
            </button>
          ))}

          {userIds.map((uid) => {
            const isSelf = uid === me?.id;
            const camera = isSelf ? (voice.cameraOn ? voice.localCamera : null) : remoteOf(uid)?.camera ?? null;
            return (
              <div
                key={uid}
                className={clsx(
                  "relative flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-discord-sidebar transition-shadow",
                  inCall && speaking[uid] ? "ring-2 ring-discord-green shadow-[0_0_14px_2px_rgb(var(--c-green)/0.35)]" : "ring-1 ring-black/30"
                )}
              >
                {camera ? (
                  <button onClick={() => setExpanded({ stream: camera, label: nameOf(uid) })} className="h-full w-full">
                    <VideoEl stream={camera} className="h-full w-full object-cover" />
                  </button>
                ) : (
                  <Avatar user={userOf(uid)} size={72} />
                )}
                <span className="absolute bottom-1.5 left-2 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
                  {isSelf && voice.muted && <MicOffIcon size={11} className="text-discord-danger" />}
                  {nameOf(uid)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom bar: join, or in-call controls. */}
      <div className="relative flex items-center justify-center gap-2 border-t border-black/30 bg-discord-deep px-4 py-3">
        {!inCall ? (
          <button
            onClick={() => joinVoice(channelId)}
            className="flex items-center gap-2 rounded-full bg-discord-green px-6 py-2.5 font-medium text-white hover:brightness-110"
          >
            <PhoneIcon size={18} /> {t("voice.join")} — {channelName}
          </button>
        ) : (
          <>
            <StageBtn active={voice.muted} danger={voice.muted} onClick={toggleMute} label={voice.muted ? t("voice.unmute") : t("voice.mute")}>
              {voice.muted ? <MicOffIcon size={20} /> : <MicIcon size={20} />}
            </StageBtn>
            <StageBtn active={voice.deafened} danger={voice.deafened} onClick={toggleDeafen} label={voice.deafened ? t("voice.undeafen") : t("voice.deafen")}>
              {voice.deafened ? <HeadphonesOffIcon size={20} /> : <HeadphonesIcon size={20} />}
            </StageBtn>
            <StageBtn active={voice.cameraOn} onClick={toggleCamera} label={t("voice.camera")}>
              <CameraIcon size={20} />
            </StageBtn>
            {isAndroidApp() && voice.cameraOn && (
              <StageBtn onClick={flipCamera} label={t("voice.flipCamera")}>
                <FlipCameraIcon size={20} />
              </StageBtn>
            )}
            {!isAndroidApp() && (
              <StageBtn active={voice.screenOn} onClick={toggleScreen} label={voice.screenOn ? t("voice.stopShare") : t("voice.share")}>
                <ScreenIcon size={20} />
              </StageBtn>
            )}
            <StageBtn active={emojiOpen} onClick={() => setEmojiOpen((v) => !v)} label={t("voice.react")}>
              <SmileIcon size={20} />
            </StageBtn>
            <button
              onClick={leaveVoice}
              title={t("voice.leave")}
              className="ml-2 flex h-11 items-center gap-2 rounded-full bg-discord-danger px-5 text-white hover:brightness-110"
            >
              <PhoneOffIcon size={18} />
            </button>
            <CallTimer className="absolute right-4 hidden text-xs text-discord-muted sm:block" />
          </>
        )}

        {emojiOpen && (
          <div className="absolute -top-12 flex gap-1 rounded-lg bg-discord-rail p-1.5 shadow-xl ring-1 ring-black/40">
            {CALL_EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => {
                  sendVoiceEmoji(e);
                  setEmojiOpen(false);
                }}
                className="rounded p-1 text-xl hover:bg-discord-hover"
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>

      {expanded && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/90" onMouseDown={() => setExpanded(null)}>
          <div className="flex items-center justify-between px-4 py-2 text-white" onMouseDown={(e) => e.stopPropagation()}>
            <span className="font-medium">{expanded.label}</span>
            <button
              onClick={() => setExpanded(null)}
              className="flex items-center gap-1.5 rounded bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20"
            >
              <XIcon size={15} /> {t("common.close")}
            </button>
          </div>
          <div className="flex flex-1 items-center justify-center p-4" onMouseDown={(e) => e.stopPropagation()}>
            <VideoEl stream={expanded.stream} className="max-h-full max-w-full" />
          </div>
        </div>
      )}
    </div>
  );
}

function StageBtn({
  children,
  label,
  onClick,
  active,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={clsx(
        "flex h-11 w-11 items-center justify-center rounded-full transition",
        active ? (danger ? "bg-discord-danger text-white" : "bg-discord-accent text-white") : "bg-discord-card text-discord-text hover:bg-discord-hover"
      )}
    >
      {children}
    </button>
  );
}
