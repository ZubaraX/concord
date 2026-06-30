import { useState } from "react";
import { useAuth } from "../store/auth";
import { useI18n } from "../lib/i18n";
import { api } from "../api/client";
import { getServerUrl, setServerUrl, serverPinned } from "../lib/serverUrl";

type Mode = "login" | "register" | "forgot" | "reset";

export default function AuthPage() {
  const { login, register } = useAuth();
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("demo@concord.dev");
  const [password, setPassword] = useState("password123");
  const [code, setCode] = useState("");
  const [server, setServer] = useState(getServerUrl());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Only show the server field when the URL isn't baked into the build.
  const showServerField = !serverPinned;

  function go(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (showServerField) setServerUrl(server);
      if (mode === "login") await login(email, password);
      else if (mode === "register") await register(username, email, password);
      else if (mode === "forgot") {
        await api("/api/auth/forgot", { method: "POST", body: JSON.stringify({ email }) });
        setMode("reset");
        setNotice(t("auth.codeSent"));
      } else if (mode === "reset") {
        await api("/api/auth/reset", { method: "POST", body: JSON.stringify({ email, code, password }) });
        setMode("login");
        setNotice(t("auth.resetDone"));
        setPassword("");
        setCode("");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const title =
    mode === "login"
      ? t("auth.welcome")
      : mode === "register"
      ? t("auth.createAccount")
      : mode === "forgot"
      ? t("auth.forgotTitle")
      : t("auth.resetTitle");

  const subtitle =
    mode === "forgot" ? t("auth.forgotSubtitle") : mode === "reset" ? t("auth.resetSubtitle") : t("auth.subtitle");

  const submitLabel = busy
    ? t("auth.loading")
    : mode === "login"
    ? t("auth.login")
    : mode === "register"
    ? t("auth.register")
    : mode === "forgot"
    ? t("auth.sendCode")
    : t("auth.resetPassword");

  return (
    <div className="cc-anim-gradient flex h-full items-center justify-center bg-gradient-to-br from-discord-accent via-discord-accentDark to-discord-accent p-4">
      <div className="cc-pop w-full max-w-md rounded-md bg-discord-bg p-8 shadow-2xl">
        <h1 className="text-center text-2xl font-bold text-white">{title}</h1>
        <p className="mt-1 text-center text-sm text-discord-muted">{subtitle}</p>

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

          {/* Email is needed in every mode except, well, all of them use it. */}
          <Field label={t("auth.email")} value={email} onChange={setEmail} type="email" placeholder="you@example.com" />

          {mode === "reset" && (
            <Field label={t("auth.code")} value={code} onChange={setCode} placeholder="A1B2C3D4" />
          )}

          {mode !== "forgot" && (
            <Field
              label={mode === "reset" ? t("auth.newPassword") : t("auth.password")}
              value={password}
              onChange={setPassword}
              type="password"
              placeholder="••••••••"
            />
          )}

          {error && <div className="text-sm text-discord-danger">{error}</div>}
          {notice && <div className="text-sm text-discord-green">{notice}</div>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-sm bg-discord-accent py-2.5 font-medium text-white transition hover:bg-discord-accentDark disabled:opacity-60"
          >
            {submitLabel}
          </button>
        </form>

        <div className="mt-4 space-y-1 text-sm text-discord-muted">
          {mode === "login" && (
            <>
              <p>
                <button onClick={() => go("register")} className="text-discord-link hover:underline">
                  {t("auth.needAccount")}
                </button>
              </p>
              <p>
                <button onClick={() => go("forgot")} className="text-discord-link hover:underline">
                  {t("auth.forgotPassword")}
                </button>
              </p>
            </>
          )}
          {mode === "register" && (
            <button onClick={() => go("login")} className="text-discord-link hover:underline">
              {t("auth.haveAccount")}
            </button>
          )}
          {(mode === "forgot" || mode === "reset") && (
            <div className="flex gap-4">
              {mode === "reset" && (
                <button onClick={() => go("forgot")} className="text-discord-link hover:underline">
                  {t("auth.sendCode")}
                </button>
              )}
              <button onClick={() => go("login")} className="text-discord-link hover:underline">
                {t("auth.backToLogin")}
              </button>
            </div>
          )}
        </div>

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
