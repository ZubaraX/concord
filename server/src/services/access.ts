import { prisma } from "../lib/db.js";

export type AccessibleChannel = NonNullable<Awaited<ReturnType<typeof fetchChannel>>>;

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
