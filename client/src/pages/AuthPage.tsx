import { useState } from "react";
import { useAuth } from "../store/auth";
import { useI18n } from "../lib/i18n";
import { getServerUrl, setServerUrl, serverPinned } from "../lib/serverUrl";

export default function AuthPage() {
  const { login, register } = useAuth();
  const { t } = useI18n();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("demo@concord.dev");
  const [password, setPassword] = useState("password123");
  const [server, setServer] = useState(getServerUrl());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Only show the server field when the URL isn't baked into the build.
  const showServerField = !serverPinned;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (showServerField) setServerUrl(server);
      if (mode === "login") await login(email, password);
      else await register(username, email, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-gradient-to-br from-discord-accent to-discord-accentDark p-4">
      <div className="w-full max-w-md rounded-md bg-discord-bg p-8 shadow-2xl">
        <h1 className="text-center text-2xl font-bold text-white">
          {mode === "login" ? t("auth.welcome") : t("auth.createAccount")}
        </h1>
        <p className="mt-1 text-center text-sm text-discord-muted">{t("auth.subtitle")}</p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          {showServerField && (
            <Field
              label={t("settings.serverUrl")}
              value={server}
              onChange={setServer}
              placeholder="https://your-codespace-4000.app.github.dev"
            />
          )}
          {mode === "register" && (
            <Field label={t("auth.username")} value={username} onChange={setUsername} placeholder="cooluser" />
          )}
          <Field label={t("auth.email")} value={email} onChange={setEmail} type="email" placeholder="you@example.com" />
          <Field label={t("auth.password")} value={password} onChange={setPassword} type="password" placeholder="••••••••" />

          {error && <div className="text-sm text-discord-danger">{error}</div>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-sm bg-discord-accent py-2.5 font-medium text-white transition hover:bg-discord-accentDark disabled:opacity-60"
          >
            {busy ? t("auth.loading") : mode === "login" ? t("auth.login") : t("auth.register")}
          </button>
        </form>

        <p className="mt-4 text-sm text-discord-muted">
          <button
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError(null);
            }}
            className="text-discord-link hover:underline"
          >
            {mode === "login" ? t("auth.needAccount") : t("auth.haveAccount")}
          </button>
        </p>

        {mode === "login" && (
          <p className="mt-3 text-xs text-discord-faint">
            Demo seed: <code>demo@concord.dev</code> / <code>password123</code>
          </p>
        )}
      </div>
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-wide text-discord-muted">{props.label}</span>
      <input
        type={props.type ?? "text"}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
        className="mt-1.5 w-full rounded-sm border-none bg-discord-deep px-3 py-2.5 text-discord-text outline-none ring-discord-accent focus:ring-1"
      />
    </label>
  );
}
