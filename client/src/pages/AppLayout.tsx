import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { connectSocket, disconnectSocket, getSocket } from "../lib/socket";
import { useUI } from "../store/ui";
import type { Guild } from "../types";
import ServerRail from "../components/ServerRail";
import ChannelSidebar from "../components/ChannelSidebar";
import ChatArea from "../components/ChatArea";
import MemberList from "../components/MemberList";
import AddServerModal from "../components/AddServerModal";
import SettingsModal from "../components/SettingsModal";
import InviteModal from "../components/InviteModal";

export default function AppLayout() {
  const { currentGuildId, setGuild, modal, closeModal } = useUI();
  const qc = useQueryClient();

  // Establish the real-time connection once for the session.
  useEffect(() => {
    connectSocket();
    return () => disconnectSocket();
  }, []);

  // Live sync: keep the guild list and the open guild's data fresh as people
  // join, profiles change, and channels are added/removed — for everyone.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const invalidateGuilds = () => qc.invalidateQueries({ queryKey: ["guilds"] });
    const invalidateGuild = (p: { guildId?: string }) =>
      qc.invalidateQueries({ queryKey: ["guild", p?.guildId ?? currentGuildId] });

    const onJoined = (guild: Guild) => {
      invalidateGuilds();
      if (guild?.id) setGuild(guild.id);
    };

    socket.on("guild:joined", onJoined);
    socket.on("guild:memberAdd", invalidateGuild);
    socket.on("guild:channelsUpdate", invalidateGuild);
    socket.on("user:update", invalidateGuild);

    return () => {
      socket.off("guild:joined", onJoined);
      socket.off("guild:memberAdd", invalidateGuild);
      socket.off("guild:channelsUpdate", invalidateGuild);
      socket.off("user:update", invalidateGuild);
    };
  }, [qc, currentGuildId, setGuild]);

  const { data: guilds = [] } = useQuery<Guild[]>({
    queryKey: ["guilds"],
    queryFn: () => api<Guild[]>("/api/guilds"),
  });

  // Auto-select the first guild on load.
  useEffect(() => {
    if (!currentGuildId && guilds.length > 0) setGuild(guilds[0].id);
  }, [guilds, currentGuildId, setGuild]);

  return (
    <div className="flex h-full w-full overflow-hidden">
      <ServerRail guilds={guilds} />
      <ChannelSidebar />
      <ChatArea />
      <MemberList />

      {modal === "addServer" && <AddServerModal onClose={closeModal} />}
      {modal === "settings" && <SettingsModal onClose={closeModal} />}
      {modal === "invite" && <InviteModal onClose={closeModal} />}
    </div>
  );
}
