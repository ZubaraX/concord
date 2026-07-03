import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
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
import OverlayController from "../components/OverlayController";
import TaskbarBadge from "../components/TaskbarBadge";
import AndroidUpdate from "../components/AndroidUpdate";
import { appVersion, changesSince, type ChangelogEntry } from "../lib/changelog";
import { initVoice } from "../lib/voice";
import { startPushService, initShareListener, initInviteListener } from "../lib/push";
import { useShare } from "../store/share";
import { useI18n } from "../lib/i18n";
import { isMuted } from "../store/mutes";
import { MenuIcon, UsersIcon, GearIcon } from "../components/Icons";

// Do-Not-Disturb: keep unread counters, but no sounds/toasts/popups.
const isDnd = () => useAuth.getState().user?.status === "DND";

export default function AppLayout() {
  const { currentGuildId, currentChannelId, setGuild, openDM, openFriends, openModal, modal, closeModal, profileUserId, closeProfile, immersive } = useUI();
  const { t } = useI18n();
  const qc = useQueryClient();
  const initialized = useRef(false);
  const ringingChannels = useRef<Set<string>>(new Set());
  const [incoming, setIncoming] = useState<{ channelId: string; name: string } | null>(null);
  const [whatsNew, setWhatsNew] = useState<ChangelogEntry[]>([]);
  // Mobile: the rail + channel sidebar slide in as a drawer over the chat.
  const [navOpen, setNavOpen] = useState(false);
  // Android: the on-screen keyboard shrinks the viewport — hide the bottom nav
  // while typing so the composer gets that space back.
  const [typingFocus, setTypingFocus] = useState(false);

  useEffect(() => {
    const isField = (el: EventTarget | null) =>
      el instanceof HTMLElement && (el.tagName === "TEXTAREA" || el.tagName === "INPUT");
    const onFocusIn = (e: FocusEvent) => isField(e.target) && setTypingFocus(true);
    const onFocusOut = (e: FocusEvent) => isField(e.target) && setTypingFocus(false);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  useEffect(() => {
    connectSocket();
    initVoice();
    requestNotifyPermission();
    startPushService(); // Android: background notifications (no-op elsewhere)
    initShareListener((s) => useShare.getState().set(s)); // Share → Concord
    // Invite link tapped outside the app → join the server right away.
    initInviteListener(async (code) => {
      try {
        const r = await api<{ guild: Guild }>(`/api/invites/${code}`, { method: "POST" });
        qc.invalidateQueries({ queryKey: ["guilds"] });
        useUI.getState().setGuild(r.guild.id);
        useNotify.getState().push({ title: "✅", body: "Вы присоединились к серверу!" });
      } catch (e) {
        useNotify.getState().push({ title: "Приглашение", body: (e as Error).message });
      }
    });
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
    socket.on("guild:rolesUpdate", invalidateGuild);
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
      if (isMuted(p.channelId, p.guildId)) return; // muted → no unread, no pings
      useUnread.getState().bump(p.channelId);
      if (myId && p.mentions?.includes(myId) && !isDnd()) {
        const who = p.authorName ?? "New mention";
        const body = p.content || "mentioned you";
        const open = () => {
          if (p.guildId) useUI.getState().setGuild(p.guildId);
          useUI.getState().setChannel(p.channelId);
        };
        push({ title: `${who} mentioned you`, body, actionLabel: "Open", onAction: open });
        playSound("message");
        desktopNotify(`${who} mentioned you`, body);
        navigator.vibrate?.([120, 60, 120]); // phones: buzz on mention
      }
    };

    // New DM message while not viewing that conversation → toast + ping + unread.
    const onDmMessage = (p: { channelId: string; message: Message }) => {
      invalidateDms();
      if (useUI.getState().currentChannelId === p.channelId) return; // already reading it
      if (isMuted(p.channelId)) return; // muted conversation → silent
      useUnread.getState().bump(p.channelId);
      if (isDnd()) return; // DND: unread counts yes, noise no
      const who = p.message.author.displayName ?? p.message.author.username;
      const body = p.message.content || (p.message.attachments?.length ? "📎 Attachment" : "");
      push({ title: who, body, actionLabel: "Open", onAction: () => openDM(p.channelId) });
      playPing();
      desktopNotify(who, body);
      navigator.vibrate?.(120); // phones: buzz on DM
    };

    // Someone joined a DM voice channel I'm not in → incoming call modal.
    const onVoiceState = (p: { channelId: string; userIds: string[] }) => {
      const dm = dmName(p.channelId);
      if (!dm) return; // guild voice, ignore
      const inThisCall = useVoice.getState().channelId === p.channelId;
      if (p.userIds.length > 0 && !inThisCall) {
        if (ringingChannels.current.has(p.channelId)) return;
        if (isDnd() || isMuted(p.channelId)) return; // no ringing on DND/muted
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
      socket.off("guild:rolesUpdate", invalidateGuild);
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

  // On phones, choosing a channel/guild slides the nav drawer away to show chat.
  useEffect(() => {
    setNavOpen(false);
  }, [currentChannelId, currentGuildId]);

  // ── Phone swipe gestures: right → open channels (or close member list),
  //    left → close channels (or open member list in a guild). ──
  const touchRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touchRef.current;
    touchRef.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    // Quick, mostly-horizontal, long enough — otherwise it's a scroll/tap.
    if (Date.now() - s.t > 600 || Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.7) return;
    const ui = useUI.getState();
    if (dx > 0) {
      if (ui.membersOpen) ui.closeMembers();
      else if (s.x < window.innerWidth * 0.4) setNavOpen(true);
    } else {
      if (navOpen) setNavOpen(false);
      else if (ui.currentGuildId && !ui.membersOpen && s.x > window.innerWidth * 0.6) ui.toggleMembers();
    }
  };

  return (
    <div className="flex h-full w-full flex-col">
    <div className="relative flex min-h-0 w-full flex-1 overflow-hidden" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* Server rail + channel sidebar: a slide-in drawer on phones, static on
          desktop. In a voice-stage call (immersive) the desktop hides it too —
          the ☰ button in the chat header brings it back. */}
      <div
        className={clsx(
          "flex h-full shrink-0 transition-transform duration-200 md:static md:z-auto md:translate-x-0",
          "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:shadow-2xl",
          navOpen ? "translate-x-0" : "max-md:-translate-x-full",
          immersive && !navOpen && "md:hidden"
        )}
      >
        <ServerRail guilds={guilds} />
        <ChannelSidebar />
      </div>
      {navOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setNavOpen(false)} />
      )}

      <div className="flex min-w-0 flex-1">
        {showFriends ? <FriendsPage onOpenNav={() => setNavOpen(true)} /> : <ChatArea onOpenNav={() => setNavOpen(true)} />}
        <MemberList />
      </div>

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
      <OverlayController />
      <TaskbarBadge />
      <AndroidUpdate />
    </div>

    {/* Phones: bottom tab bar (Servers / Friends / Settings). Hidden while
        typing so the keyboard-shrunk viewport goes to the chat. */}
    <nav
      className={clsx(
        "flex shrink-0 border-t border-black/40 bg-discord-rail pb-[env(safe-area-inset-bottom)] md:hidden",
        typingFocus && "hidden"
      )}
    >
      <NavTab icon={<MenuIcon size={20} />} label={t("nav.servers")} onClick={() => setNavOpen(true)} />
      <NavTab icon={<UsersIcon size={20} />} label={t("friends.title")} active={showFriends} onClick={openFriends} />
      <NavTab icon={<GearIcon size={20} />} label={t("settings.title")} onClick={() => openModal("settings")} />
    </nav>
    </div>
  );
}

function NavTab({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[11px] font-medium",
        active ? "text-white" : "text-discord-muted"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
