import { useEffect, useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { api } from "../api/client";
import { useVoice } from "../store/voice";
import { useAuth } from "../store/auth";
import { useSettings } from "../store/settings";
import { getMicStream } from "../lib/voice";
import { serverPath } from "../lib/serverUrl";
import { useSpeaking, type SpeakStream } from "../lib/speaking";
import type { User } from "../types";

export interface OverlayParticipant {
  userId: string;
  name: string;
  avatarUrl: string | null;
  speaking: boolean;
  muted: boolean;
}

// Runs inside the main app (renders nothing). Detects who's speaking and pushes
// the call roster to the always-on-top overlay window via the desktop bridge.
export default function OverlayController() {
  const { channelId, remotes, muted } = useVoice();
  const me = useAuth((s) => s.user);
  const overlayEnabled = useSettings((s) => s.overlayEnabled);
  const overlayCorner = useSettings((s) => s.overlayCorner);

  const speakStreams = useMemo<SpeakStream[]>(() => {
    const list: SpeakStream[] = [];
    const mic = getMicStream();
    if (channelId && me && mic) list.push({ id: me.id, stream: mic, enabled: !muted });
    for (const r of remotes) if (r.audio) list.push({ id: r.userId, stream: r.audio });
    return list;
  }, [channelId, me, muted, remotes]);

  const speaking = useSpeaking(speakStreams);

  const remoteIds = useMemo(() => [...new Set(remotes.map((r) => r.userId))], [remotes]);
  const profiles = useQueries({
    queries: remoteIds.map((id) => ({
      queryKey: ["profile", id],
      queryFn: () => api<User>(`/api/users/${id}`),
      staleTime: 5 * 60_000,
    })),
  });
  const profileSig = profiles.map((p) => (p.data ? p.data.id : "")).join(",");

  const participants = useMemo<OverlayParticipant[]>(() => {
    if (!channelId || !me) return [];
    const nameOf = new Map<string, User>();
    remoteIds.forEach((id, i) => {
      const d = profiles[i]?.data;
      if (d) nameOf.set(id, d);
    });
    const avatar = (url: string | null | undefined) => (url ? serverPath(url) : null);
    const self: OverlayParticipant = {
      userId: me.id,
      name: me.displayName ?? me.username,
      avatarUrl: avatar(me.avatarUrl),
      speaking: !!speaking[me.id],
      muted,
    };
    const others = remotes.map((r) => {
      const u = nameOf.get(r.userId);
      return {
        userId: r.userId,
        name: u?.displayName ?? u?.username ?? "…",
        avatarUrl: avatar(u?.avatarUrl),
        speaking: !!speaking[r.userId],
        muted: false,
      };
    });
    return [self, ...others];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, me, remotes, speaking, muted, profileSig]);

  useEffect(() => {
    window.concord?.sendOverlayState?.({
      enabled: overlayEnabled,
      active: !!channelId,
      corner: overlayCorner,
      participants,
    });
  }, [participants, overlayEnabled, channelId, overlayCorner]);

  return null;
}
