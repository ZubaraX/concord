import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { connectSocket, disconnectSocket, getSocket } from "../lib/socket";
import { useUI } from "../store/ui";
import type { Guild } from "../types";
import ServerRail from "../components/ServerRail";
import ChannelSidebar from "../components/ChannelSidebar";
import ChatArea from "../components/ChatArea";
import FriendsPage from "../components/FriendsPage";
import MemberList from "../components/MemberList";
import AddServerModal from "../components/AddServerModal";
import SettingsModal from "../components/SettingsModal";
import InviteModal from "../components/InviteModal";
import VoiceOverlay from "../components/VoiceOverlay";
import { initVoice } from "../lib/voice";

export default function AppLayout() {
  const { currentGuildId, currentChannelId, setGuild, modal, closeModal } = useUI();
  const qc = useQueryClient();
  const initialized = useRef(false);

  useEffect(() => {
    connectSocket();
    initVoice();
    return () => disconnectSocket();
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

    return () => {
      socket.off("guild:joined", onJoined);
      socket.off("guild:memberAdd", invalidateGuild);
      socket.off("guild:channelsUpdate", invalidateGuild);
      socket.off("user:update", invalidateGuild);
      socket.off("friend:request", invalidateFriends);
      socket.off("friend:accept", invalidateFriends);
      socket.off("friend:remove", invalidateFriends);
      socket.off("dm:new", invalidateDms);
    };
  }, [qc, currentGuildId, setGuild]);

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

      {modal === "addServer" && <AddServerModal onClose={closeModal} />}
      {modal === "settings" && <SettingsModal onClose={closeModal} />}
      {modal === "invite" && <InviteModal onClose={closeModal} />}
    </div>
  );
}
