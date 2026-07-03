// Mirrors server/src/lib/permissions.ts — only the bits the client actually
// needs to decide which buttons to show (the server re-checks everything, so
// this is UI convenience only, never a security boundary).
export const Permissions = {
  ADMINISTRATOR: 1n << 3n,
  MANAGE_CHANNELS: 1n << 4n,
  MANAGE_ROLES: 1n << 28n,
  MANAGE_EMOJIS: 1n << 30n,
} as const;

export function combinePermissions(roles: { permissions: string }[] | undefined): bigint {
  return (roles ?? []).reduce((acc, r) => acc | BigInt(r.permissions || "0"), 0n);
}

/** True if `bitfield` grants `perm` (ADMINISTRATOR grants everything). */
export function hasPermission(bitfield: bigint, perm: bigint): boolean {
  if (bitfield & Permissions.ADMINISTRATOR) return true;
  return (bitfield & perm) === perm;
}

/** Convenience: does this member (or the guild owner) have `perm`? */
export function memberHasPermission(
  guild: { ownerId: string; members?: { user: { id: string }; roles: { permissions: string }[] }[] } | undefined,
  userId: string | undefined,
  perm: bigint
): boolean {
  if (!guild || !userId) return false;
  if (guild.ownerId === userId) return true;
  const member = guild.members?.find((m) => m.user.id === userId);
  return hasPermission(combinePermissions(member?.roles), perm);
}
