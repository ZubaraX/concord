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
  updateProfile: (patch: Partial<User>) => Promise<void>;
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
    // No credentials at all → straight to login.
    if (!tokens.access && !tokens.refresh) return set({ loading: false });
    // api() transparently refreshes the access token via the refresh token on a
    // 401, so an expired access token alone won't log us out.
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const { user } = await api<{ user: User }>("/api/auth/me");
        return set({ user, loading: false });
      } catch (e) {
        const msg = (e as Error)?.message ?? "";
        // A real auth failure (refresh also rejected) → the session is invalid.
        if (/401|unauthor|invalid/i.test(msg)) {
          tokens.clear();
          return set({ user: null, loading: false });
        }
        // Network/transient (server starting, offline, brief outage): keep the
        // tokens and retry — don't wipe a valid session over a hiccup.
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    // Still unreachable after retries: keep tokens for next launch, drop loading.
    set({ loading: false });
  },

  async updateProfile(patch) {
    const { user } = await api<{ user: User }>("/api/auth/me", {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    set({ user });
  },
}));
