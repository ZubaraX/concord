import { create } from "zustand";
import type { User } from "../types";
import { api, tokens } from "../api/client";

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  loading: true,

  async login(email, password) {
    const data = await api<{ user: User; accessToken: string; refreshToken: string }>(
      "/api/auth/login",
      { method: "POST", body: JSON.stringify({ email, password }) }
    );
    tokens.set(data.accessToken, data.refreshToken);
    set({ user: data.user });
  },

  async register(username, email, password) {
    const data = await api<{ user: User; accessToken: string; refreshToken: string }>(
      "/api/auth/register",
      { method: "POST", body: JSON.stringify({ username, email, password }) }
    );
    tokens.set(data.accessToken, data.refreshToken);
    set({ user: data.user });
  },

  async logout() {
    await api("/api/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken: tokens.refresh }),
    }).catch(() => {});
    tokens.clear();
    set({ user: null });
  },

  async hydrate() {
    if (!tokens.access) return set({ loading: false });
    try {
      const { user } = await api<{ user: User }>("/api/auth/me");
      set({ user, loading: false });
    } catch {
      tokens.clear();
      set({ user: null, loading: false });
    }
  },
}));
