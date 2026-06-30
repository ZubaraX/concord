import { create } from "zustand";
import type { User } from "../types";
import { api, tokens } from "../api/client";

const USER_KEY = "concord.user";
const cachedUser = (): User | null => {
  try {
    const s = localStorage.getItem(USER_KEY);
    return s ? (JSON.parse(s) as User) : null;
  } catch {
    return null;
  }
};
const saveUser = (u: User | null) => {
  try {
    if (u) localStorage.setItem(USER_KEY, JSON.stringify(u));
    else localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
};

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
    saveUser(data.user);
    set({ user: data.user });
  },

  async register(username, email, password) {
    const data = await api<{ user: User; accessToken: string; refreshToken: string }>(
      "/api/auth/register",
      { method: "POST", body: JSON.stringify({ username, email, password }) }
    );
    tokens.set(data.accessToken, data.refreshToken);
    saveUser(data.user);
    set({ user: data.user });
  },

  async logout() {
    await api("/api/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken: tokens.refresh }),
    }).catch(() => {});
    tokens.clear();
    saveUser(null);
    set({ user: null });
  },

  async hydrate() {
    // No credentials at all → straight to login.
    if (!tokens.access && !tokens.refresh) return set({ loading: false });

    // Optimistic restore: if we cached the user from a previous session, show
    // the app immediately and validate in the background. This prevents a
    // slow/unreachable server at launch from bouncing a still-logged-in user
    // back to the login screen — we only log out on a *real* auth rejection.
    const cached = cachedUser();
    if (cached) set({ user: cached, loading: false });

    // api() transparently refreshes the access token via the refresh token on a
    // 401, so an expired access token alone won't log us out.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const { user } = await api<{ user: User }>("/api/auth/me");
        saveUser(user);
        return set({ user, loading: false });
      } catch (e) {
        const msg = (e as Error)?.message ?? "";
        // A real auth failure (refresh also rejected) → the session is invalid.
        if (/401|unauthor|invalid/i.test(msg)) {
          tokens.clear();
          saveUser(null);
          return set({ user: null, loading: false });
        }
        // Network/transient (server starting, offline, brief outage): keep the
        // tokens (and the optimistic cached user) and retry — never wipe a valid
        // session over a hiccup.
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    // Still unreachable after retries: keep the cached session for next launch.
    set({ loading: false });
  },

  async updateProfile(patch) {
    const { user } = await api<{ user: User }>("/api/auth/me", {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    saveUser(user);
    set({ user });
  },
}));
