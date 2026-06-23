export type PresenceStatus = "ONLINE" | "IDLE" | "DND" | "OFFLINE";

export type ChannelType =
  | "TEXT"
  | "VOICE"
  | "CATEGORY"
  | "ANNOUNCEMENT"
  | "FORUM"
  | "STAGE";

export interface User {
  id: string;
  username: string;
  discriminator: string;
  email?: string;
  displayName: string | null;
  avatarUrl: string | null;
  status?: PresenceStatus;
}

export interface Channel {
  id: string;
  guildId: string;
  name: string;
  type: ChannelType;
  topic: string | null;
  position: number;
  parentId: string | null;
  bitrate: number;
  userLimit: number;
  slowmode: number;
}

export interface Role {
  id: string;
  name: string;
  color: string;
  position: number;
  hoist: boolean;
  permissions: string;
  isDefault: boolean;
}

export interface GuildMember {
  id: string;
  nickname: string | null;
  user: User;
  roles: Role[];
}

export interface Guild {
  id: string;
  name: string;
  iconUrl: string | null;
  bannerUrl: string | null;
  description: string | null;
  ownerId: string;
  channels: Channel[];
  roles?: Role[];
  members?: GuildMember[];
}

export interface Message {
  id: string;
  channelId: string;
  content: string;
  author: User;
  replyTo?: Message | null;
  pinned: boolean;
  editedAt: string | null;
  createdAt: string;
  attachments: Attachment[];
}

export interface Attachment {
  id: string;
  url: string;
  filename: string;
  size: number;
  mimeType: string;
  width?: number | null;
  height?: number | null;
}
