import { prisma } from "../lib/db.js";
import { combine, has, ALL_PERMISSIONS, Permissions, type PermissionName } from "../lib/permissions.js";

export type AccessibleChannel = NonNullable<Awaited<ReturnType<typeof fetchChannel>>>;

/**
 * Combined permission bitfield for a member in a guild. The owner always gets
 * every permission (bypasses the role system entirely, same as Discord).
 */
export async function getGuildPermissions(userId: string, guildId: string): Promise<bigint> {
  const guild = await prisma.guild.findUnique({ where: { id: guildId }, select: { ownerId: true } });
  if (!guild) return 0n;
  if (guild.ownerId === userId) return ALL_PERMISSIONS;

  const member = await prisma.guildMember.findUnique({
    where: { guildId_userId: { guildId, userId } },
    include: { roles: { select: { permissions: true } } },
  });
  if (!member) return 0n;
  return combine(member.roles.map((r) => r.permissions));
}

/** True if the member (or guild owner) holds `perm` in this guild. */
export async function hasGuildPermission(userId: string, guildId: string, perm: PermissionName): Promise<boolean> {
  return has(await getGuildPermissions(userId, guildId), Permissions[perm]);
}

function fetchChannel(channelId: string) {
  return prisma.channel.findUnique({
    where: { id: channelId },
    include: { dmParticipants: { select: { id: true } } },
  });
}

/**
 * Returns the channel if the user may access it, else null.
 * Guild channel → must be a guild member. DM channel → must be a participant.
 */
export async function getAccessibleChannel(userId: string, channelId: string) {
  const channel = await fetchChannel(channelId);
  if (!channel) return null;
  if (channel.guildId) {
    const member = await prisma.guildMember.findUnique({
      where: { guildId_userId: { guildId: channel.guildId, userId } },
    });
    return member ? channel : null;
  }
  return channel.dmParticipants.some((p) => p.id === userId) ? channel : null;
}
