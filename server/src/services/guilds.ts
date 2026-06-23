// Shared guild membership + realtime helpers, used by guild/invite routes.
import { prisma } from "../lib/db.js";
import { getIOorNull, guildRoom, userRoom } from "../realtime/io.js";

export const memberInclude = {
  user: {
    select: {
      id: true,
      username: true,
      discriminator: true,
      displayName: true,
      avatarUrl: true,
      status: true,
    },
  },
  roles: true,
} as const;

/** Pull a user's live sockets into a guild room (e.g. after create/join). */
export function joinGuildRoom(guildId: string, userId: string) {
  getIOorNull()?.in(userRoom(userId)).socketsJoin(guildRoom(guildId));
}

/** Broadcast to everyone currently in a guild. */
export function emitToGuild(guildId: string, event: string, payload: unknown) {
  getIOorNull()?.to(guildRoom(guildId)).emit(event, payload);
}

/** Add a user to a guild (idempotent) + wire realtime so all clients sync. */
export async function joinGuild(guildId: string, userId: string) {
  const everyone = await prisma.role.findFirst({ where: { guildId, isDefault: true } });

  const member = await prisma.guildMember.upsert({
    where: { guildId_userId: { guildId, userId } },
    update: {},
    create: {
      guildId,
      userId,
      roles: everyone ? { connect: { id: everyone.id } } : undefined,
    },
    include: memberInclude,
  });

  const io = getIOorNull();
  if (io) {
    // The joining user's sockets start receiving this guild's events now,
    // and existing members see the new member appear live.
    io.in(userRoom(userId)).socketsJoin(guildRoom(guildId));
    io.to(guildRoom(guildId)).emit("guild:memberAdd", { guildId, member });

    const guild = await prisma.guild.findUnique({
      where: { id: guildId },
      include: { channels: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] } },
    });
    io.to(userRoom(userId)).emit("guild:joined", guild);
  }

  return member;
}
