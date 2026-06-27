import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { connectSocket, disconnectSocket, getSocket } from "../lib/socket";
import { useUI } from "../store/ui";
import { useAuth } from "../store/auth";
import { useVoice } from "../store/voice";
import { useNotify } from "../store/notify";
import { useUnread } from "../store/unread";
import { playPing, playSound, desktopNotify, requestNotifyPermission } from "../lib/sound";
import { joinVoice } from "../lib/voice";
import type { DMSummary, Guild, Message } from "../types";
import ServerRail from "../components/ServerRail";
import ChannelSidebar from "../components/ChannelSidebar";
import ChatArea from "../components/ChatArea";
import FriendsPage from "../components/FriendsPage";
import MemberList from "../components/MemberList";
import AddServerModal from "../components/AddServerModal";
import SettingsModal from "../components/SettingsModal";
import InviteModal from "../components/InviteModal";
import VoiceOverlay from "../components/VoiceOverlay";
import Toasts from "../components/Toasts";
import IncomingCallModal from "../components/IncomingCallModal";
import UserProfileModal from "../components/UserProfileModal";
import WhatsNewModal from "../components/WhatsNewModal";
import Lightbox from "../components/Lightbox";
import ScreenPicker from "../components/ScreenPicker";
import { appVersion, changesSince, type ChangelogEntry } from "../lib/changelog";
import { initVoice } from "../lib/voice";

export default function AppLayout() {
  const { currentGuildId, currentChannelId, setGuild, openDM, modal, closeModal, profileUserId, closeProfile } = useUI();
  const qc = useQueryClient();
  const initialized = useRef(false);
  const ringingChannels = useRef<Set<string>>(new Set());
  const [incoming, setIncoming] = useState<{ channelId: string; name: string } | null>(null);
  const [whatsNew, setWhatsNew] = useState<ChangelogEntry[]>([]);

  useEffect(() => {
    connectSocket();
    initVoice();
    requestNotifyPermission();
    return () => disconnectSocket();
  }, []);

  // After an auto-update, the new build starts with a higher version than what
  // we last recorded → show "What's New" once, then remember this version.
  useEffect(() => {
    const cur = appVersion();
    const last = localStorage.getItem("concord.lastVersion");
    if (last && last !== cur) {
      const entries = changesSince(last);
      if (entries.length) setWhatsNew(entries);
    }
    localStorage.setItem("concord.lastVersion", cur);
  }, []);

  // Live sync for guilds, friends, and DMs.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const invalidateGuilds = () => qc.invalidateQueries({ queryKey: ["guilds"] });
    const invalidateGuild = (p: { guildId?: string }) =>
      qc.invalidateQueries({ queryKey: ["guild", p?.guildId ?? currentGuildId] });
    const invalidateFriends = () => {
      qc.invalidateQueries({ queryKey: ["friends"] });
    };
    const invalidateDms = () => qc.invalidateQueries({ queryKey: ["dms"] });

    const onJoined = (guild: Guild) => {
      invalidateGuilds();
      if (guild?.id) setGuild(guild.id);
    };

    socket.on("guild:joined", onJoined);
    socket.on("guild:memberAdd", invalidateGuild);
    socket.on("guild:channelsUpdate", invalidateGuild);
    socket.on("user:update", invalidateGuild);
    socket.on("friend:request", invalidateFriends);
    socket.on("friend:accept", invalidateFriends);
    socket.on("friend:remove", invalidateFriends);
    socket.on("dm:new", invalidateDms);

    const push = useNotify.getState().push;
    const dmName = (channelId: string) =>
      (qc.getQueryData<DMSummary[]>(["dms"]) ?? []).find((d) => d.id === channelId);

    // Guild channel activity → unread indicator (unless viewing it). If the
    // message @-mentions me, also ping + desktop-notify even in a guild channel.
    const onActivity = (p: {
      channelId: string;
      guildId?: string;
      authorId: string;
      authorName?: string;
      content?: string;
      mentions?: string[];
    }) => {
      const myId = useAuth.getState().user?.id;
      if (p.authorId === myId) return;
      if (useUI.getState().currentChannelId === p.channelId) return; // already reading it
      useUnread.getState().bump(p.channelId);
      if (myId && p.mentions?.includes(myId)) {
        const who = p.authorName ?? "New mention";
        const body = p.content || "mentioned you";
        const open = () => {
          if (p.guildId) useUI.getState().setGuild(p.guildId);
          useUI.getState().setChannel(p.channelId);
        };
        push({ title: `${who} mentioned you`, body, actionLabel: "Open", onAction: open });
        playSound("message");
        desktopNotify(`${who} mentioned you`, body);
      }
    };

    // New DM message while not viewing that conversation → toast + ping + unread.
    const onDmMessage = (p: { channelId: string; message: Message }) => {
      invalidateDms();
      if (useUI.getState().currentChannelId === p.channelId) return; // already reading it
      useUnread.getState().bump(p.channelId);
      const who = p.message.author.displayName ?? p.message.author.username;
      const body = p.message.content || (p.message.attachments?.length ? "📎 Attachment" : "");
      push({ title: who, body, actionLabel: "Open", onAction: () => openDM(p.channelId) });
      playPing();
      desktopNotify(who, body);
    };

    // Someone joined a DM voice channel I'm not in → incoming call modal.
    const onVoiceState = (p: { channelId: string; userIds: string[] }) => {
      const dm = dmName(p.channelId);
      if (!dm) return; // guild voice, ignore
      const inThisCall = useVoice.getState().channelId === p.channelId;
      if (p.userIds.length > 0 && !inThisCall) {
        if (ringingChannels.current.has(p.channelId)) return;
        ringingChannels.current.add(p.channelId);
        setIncoming({ channelId: p.channelId, name: dm.name });
        desktopNotify("Incoming call", `${dm.name} is calling you`);
      } else if (p.userIds.length === 0) {
        ringingChannels.current.delete(p.channelId);
        setIncoming((cur) => (cur?.channelId === p.channelId ? null : cur));
      }
    };

    socket.on("notify:dm", onDmMessage);
    socket.on("channel:activity", onActivity);
    socket.on("voice:state", onVoiceState);

    return () => {
      socket.off("guild:joined", onJoined);
      socket.off("guild:memberAdd", invalidateGuild);
      socket.off("guild:channelsUpdate", invalidateGuild);
      socket.off("user:update", invalidateGuild);
      socket.off("friend:request", invalidateFriends);
      socket.off("friend:accept", invalidateFriends);
      socket.off("friend:remove", invalidateFriends);
      socket.off("dm:new", invalidateDms);
      socket.off("notify:dm", onDmMessage);
      socket.off("channel:activity", onActivity);
      socket.off("voice:state", onVoiceState);
    };
  }, [qc, currentGuildId, setGuild, openDM]);

  const { data: guilds = [] } = useQuery<Guild[]>({
    queryKey: ["guilds"],
    queryFn: () => api<Guild[]>("/api/guilds"),
  });

  // Select the first guild once on initial load (don't fight Home navigation).
  useEffect(() => {
    if (!initialized.current && guilds.length > 0) {
      initialized.current = true;
      if (!currentGuildId && !currentChannelId) setGuild(guilds[0].id);
    }
  }, [guilds, currentGuildId, currentChannelId, setGuild]);

  // Home view with nothing open → Friends page; otherwise the chat.
  const showFriends = currentGuildId === null && currentChannelId === null;

  return (
    <div className="flex h-full w-full overflow-hidden">
      <ServerRail guilds={guilds} />
      <ChannelSidebar />
      {showFriends ? <FriendsPage /> : <ChatArea />}
      <MemberList />

      <VoiceOverlay />
      <Toasts />
      {incoming && (
        <IncomingCallModal
          name={incoming.name}
          onAccept={() => { openDM(incoming.channelId); joinVoice(incoming.channelId); setIncoming(null); }}
          onDecline={() => setIncoming(null)}
        />
      )}

      {modal === "addServer" && <AddServerModal onClose={closeModal} />}
      {modal === "settings" && <SettingsModal onClose={closeModal} />}
      {modal === "invite" && <InviteModal onClose={closeModal} />}
      {profileUserId && <UserProfileModal userId={profileUserId} onClose={closeProfile} />}
      {whatsNew.length > 0 && <WhatsNewModal entries={whatsNew} onClose={() => setWhatsNew([])} />}
      <Lightbox />
      <ScreenPicker />
    </div>
  );
}
