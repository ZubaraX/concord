// Saved messages ("bookmarks") — local-only, like Slack's "Later". Stores a
// snapshot of the message so it renders even if the original scrolls out of
// the loaded history (or is later deleted).
import { create } from "zustand";
import type { Message } from "../types";

export interface Bookmark {
  id: string; // message id
  channelId: string;
  guildId: string | null; // null → DM
  authorName: string;
  content: string;
  createdAt: string;
  savedAt: number;
}

const KEY = "concord.bookmarks";

const load = (): Bookmark[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Bookmark[];
  } catch {
    return [];
  }
};
const save = (list: Bookmark[]) => localStorage.setItem(KEY, JSON.stringify(list));

interface BookmarkStore {
  bookmarks: Bookmark[];
  isBookmarked: (messageId: string) => boolean;
  toggle: (message: Message, guildId: string | null) => void;
  remove: (messageId: string) => void;
}

export const useBookmarks = create<BookmarkStore>((set, get) => ({
  bookmarks: load(),
  isBookmarked: (messageId) => get().bookmarks.some((b) => b.id === messageId),
  toggle: (message, guildId) => {
    const cur = get().bookmarks;
    const next = cur.some((b) => b.id === message.id)
      ? cur.filter((b) => b.id !== message.id)
      : [
          {
            id: message.id,
            channelId: message.channelId,
            guildId,
            authorName: message.author.displayName ?? message.author.username,
            content: message.content || "📎 Attachment",
            createdAt: message.createdAt,
            savedAt: Date.now(),
          },
          ...cur,
        ];
    save(next);
    set({ bookmarks: next });
  },
  remove: (messageId) => {
    const next = get().bookmarks.filter((b) => b.id !== messageId);
    save(next);
    set({ bookmarks: next });
  },
}));
