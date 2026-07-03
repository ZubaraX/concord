import { useEffect, useState } from "react";
import clsx from "clsx";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { getSocket } from "../lib/socket";
import { useUI } from "../store/ui";
import { useAuth } from "../store/auth";
import { joinVoice } from "../lib/voice";
import { useNotify } from "../store/notify";
import { useI18n } from "../lib/i18n";
import type { Guild, GuildMember, PresenceStatus, User } from "../types";
import { memberHasPermission, Permissions } from "../lib/permissions";
import Avatar from "./Avatar";
import ContextMenu, { type MenuItem } from "./ContextMenu";
import MemberRolesPopover from "./MemberRolesPopover";
import { UserIcon, MessageIcon, PhoneIcon, UserPlusIcon, CopyIcon, ShieldIcon } from "./Icons";

export default function MemberList() {
  const { currentGuildId, openDM, openProfile, membersOpen, closeMembers } = useUI();
  const { user: me } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const [presence, setPresence] = useState<Record<string, PresenceStatus>>({});
  const [menu, setMenu] = useState<{ x: number; y: number; user: User } | null>(null);
  const [rolesPop, setRolesPop] = useState<{ x: number; y: number; userId: string } | null>(null);

  const { data: guild } = useQuery<Guild>({
    queryKey: ["guild", currentGuildId],
    queryFn: () => api<Guild>(`/api/guilds/${currentGuildId}`),
    enabled: !!currentGuildId,
  });

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onPresence = (p: { userId: string; status: PresenceStatus }) =>
      setPresence((prev) => ({ ...prev, [p.userId]: p.status }));
    socket.on("presence:update", onPresence);
    return () => void socket.off("presence:update", onPresence);
  }, []);

  if (!currentGuildId || !guild?.members) return null;

  const withStatus = (m: GuildMember): PresenceStatus => presence[m.user.id] ?? m.user.status ?? "OFFLINE";
  const online = guild.members.filter((m) => withStatus(m) !== "OFFLINE");
  const offline = guild.members.filter((m) => withStatus(m) === "OFFLINE");

  async function openDMWith(u: User, call = false) {
    try {
      const dm = await api<{ id: string }>("/api/dms", { method: "POST", body: JSON.stringify({ userId: u.id }) });
      qc.invalidateQueries({ queryKey: ["dms"] });
      openDM(dm.id);
      if (call) joinVoice(dm.id);
    } catch (e) {
      useNotify.getState().push({ title: "Can't open DM", body: (e as Error).message });
    }
  }

  const canManageRoles = memberHasPermission(guild, me?.id, Permissions.MANAGE_ROLES);

  function menuItems(u: User): MenuItem[] {
    return [
      { label: t("profile.viewProfile"), icon: <UserIcon size={16} />, onClick: () => openProfile(u.id) },
      { label: t("profile.message"), icon: <MessageIcon size={16} />, onClick: () => openDMWith(u) },
      { label: t("voice.call"), icon: <PhoneIcon size={16} />, onClick: () => openDMWith(u, true) },
      {
        label: t("friends.addFriend"),
        icon: <UserPlusIcon size={16} />,
        onClick: () =>
          api("/api/friends/request", { method: "POST", body: JSON.stringify({ username: u.username, discriminator: u.discriminator }) })
            .then(() => useNotify.getState().push({ title: "Friend request sent", body: `${u.username}#${u.discriminator}` }))
            .catch((e) => useNotify.getState().push({ title: "Couldn't add friend", body: (e as Error).message })),
      },
      ...(canManageRoles
        ? [
            {
              label: t("roles.manage"),
              icon: <ShieldIcon size={16} />,
              onClick: () => setRolesPop({ x: menu?.x ?? 0, y: menu?.y ?? 0, userId: u.id }),
            },
          ]
        : []),
      { label: t("common.copy") + " ID", icon: <CopyIcon size={16} />, onClick: () => navigator.clipboard?.writeText(u.id) },
    ];
  }

  const rowMenu = (e: React.MouseEvent, u: User) => {
    if (u.id === me?.id) return;
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, user: u });
  };

  return (
    <>
      {/* Phones: slide-in drawer from the right (opened from the chat header). */}
      {membersOpen && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={closeMembers} />}
      <aside
        className={clsx(
          "w-60 flex-col bg-discord-sidebar",
          "max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-40 max-lg:shadow-2xl",
          membersOpen ? "flex" : "hidden lg:flex"
        )}
      >
        <div className="flex-1 overflow-y-auto px-2 py-4">
          <Section title={`${t("members.online")} — ${online.length}`} members={online} status={withStatus} onMenu={rowMenu} />
          <Section title={`${t("members.offline")} — ${offline.length}`} members={offline} status={withStatus} onMenu={rowMenu} dim />
        </div>
        {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.user)} onClose={() => setMenu(null)} />}
        {rolesPop && currentGuildId && (
          <MemberRolesPopover
            guildId={currentGuildId}
            userId={rolesPop.userId}
            x={rolesPop.x}
            y={rolesPop.y}
            onClose={() => setRolesPop(null)}
          />
        )}
      </aside>
    </>
  );
}

function Section({
  title,
  members,
  status,
  onMenu,
  dim,
}: {
  title: string;
  members: GuildMember[];
  status: (m: GuildMember) => PresenceStatus;
  onMenu: (e: React.MouseEvent, u: User) => void;
  dim?: boolean;
}) {
  if (members.length === 0) return null;
  return (
    <div className="mb-4">
      <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-discord-muted">{title}</div>
      {members.map((m) => {
        const top = m.roles?.find((r) => !r.isDefault && r.color);
        return (
          <div
            key={m.id}
            onClick={(e) => onMenu(e, m.user)}
            onContextMenu={(e) => onMenu(e, m.user)}
            className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-discord-hover ${dim ? "opacity-50" : ""}`}
          >
            <Avatar user={m.user} size={32} status={status(m)} />
            <span className="truncate text-sm font-medium" style={{ color: top?.color }}>
              {m.nickname ?? m.user.displayName ?? m.user.username}
            </span>
          </div>
        );
      })}
    </div>
  );
}
