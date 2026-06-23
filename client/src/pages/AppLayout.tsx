import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { connectSocket, disconnectSocket } from "../lib/socket";
import { useUI } from "../store/ui";
import type { Guild } from "../types";
import ServerRail from "../components/ServerRail";
import ChannelSidebar from "../components/ChannelSidebar";
import ChatArea from "../components/ChatArea";
import MemberList from "../components/MemberList";

export default function AppLayout() {
  const { currentGuildId, setGuild } = useUI();

  // Establish the real-time connection once for the session.
  useEffect(() => {
    connectSocket();
    return () => disconnectSocket();
  }, []);

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
    </div>
  );
}
