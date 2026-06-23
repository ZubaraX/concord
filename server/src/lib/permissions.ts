// Discord-style permission flags as a BigInt bitfield (53+ flags supported).
// Stored on roles as a decimal string; computed per-member here.

export const Permissions = {
  CREATE_INVITE: 1n << 0n,
  KICK_MEMBERS: 1n << 1n,
  BAN_MEMBERS: 1n << 2n,
  ADMINISTRATOR: 1n << 3n,
  MANAGE_CHANNELS: 1n << 4n,
  MANAGE_GUILD: 1n << 5n,
  ADD_REACTIONS: 1n << 6n,
  VIEW_AUDIT_LOG: 1n << 7n,
  PRIORITY_SPEAKER: 1n << 8n,
  STREAM: 1n << 9n,
  VIEW_CHANNEL: 1n << 10n,
  SEND_MESSAGES: 1n << 11n,
  MANAGE_MESSAGES: 1n << 13n,
  EMBED_LINKS: 1n << 14n,
  ATTACH_FILES: 1n << 15n,
  READ_MESSAGE_HISTORY: 1n << 16n,
  MENTION_EVERYONE: 1n << 17n,
  USE_EXTERNAL_EMOJIS: 1n << 18n,
  CONNECT: 1n << 20n,
  SPEAK: 1n << 21n,
  MUTE_MEMBERS: 1n << 22n,
  DEAFEN_MEMBERS: 1n << 23n,
  MOVE_MEMBERS: 1n << 24n,
  USE_VAD: 1n << 25n,
  CHANGE_NICKNAME: 1n << 26n,
  MANAGE_NICKNAMES: 1n << 27n,
  MANAGE_ROLES: 1n << 28n,
  MANAGE_WEBHOOKS: 1n << 29n,
  MANAGE_EMOJIS: 1n << 30n,
  CREATE_THREADS: 1n << 34n,
  MODERATE_MEMBERS: 1n << 40n,
} as const;

export type PermissionName = keyof typeof Permissions;

// Sensible default for the @everyone role: read + send + voice basics.
export const DEFAULT_EVERYONE_PERMISSIONS =
  Permissions.VIEW_CHANNEL |
  Permissions.SEND_MESSAGES |
  Permissions.READ_MESSAGE_HISTORY |
  Permissions.ADD_REACTIONS |
  Permissions.EMBED_LINKS |
  Permissions.ATTACH_FILES |
  Permissions.CONNECT |
  Permissions.SPEAK |
  Permissions.STREAM |
  Permissions.USE_VAD |
  Permissions.CHANGE_NICKNAME |
  Permissions.CREATE_INVITE;

export const ALL_PERMISSIONS = Object.values(Permissions).reduce((a, b) => a | b, 0n);

/** OR together a set of role permission strings. */
export function combine(roleBitfields: string[]): bigint {
  return roleBitfields.reduce((acc, b) => acc | BigInt(b || "0"), 0n);
}

/** ADMINISTRATOR (or guild owner, handled by caller) grants everything. */
export function has(bitfield: bigint, perm: bigint): boolean {
  if (bitfield & Permissions.ADMINISTRATOR) return true;
  return (bitfield & perm) === perm;
}
