import { useState } from "react";
import { useAuth } from "../store/auth";
import { useSettings } from "../store/settings";
import { useI18n, LANGUAGES, type Lang } from "../lib/i18n";
import { appVersion, recentChanges } from "../lib/changelog";
import WhatsNewModal from "./WhatsNewModal";
import { getServerUrl, setServerUrl, serverPinned } from "../lib/serverUrl";
import type { PresenceStatus } from "../types";
import Modal from "./Modal";
import Avatar from "./Avatar";
import VoiceSettings from "./VoiceSettings";
import SecuritySettings from "./SecuritySettings";

const STATUSES: PresenceStatus[] = ["ONLINE", "IDLE", "DND", "OFFLINE"];

type ThemeId = "blurple" | "midnight" | "aurora" | "sunset" | "crimson" | "light";
// Swatch colors for the theme picker (preview only; the live theme is driven by
// CSS variables in index.css).
const THEMES: { id: ThemeId; accent: string; accent2: string; bg: string; fg: string }[] = [
  { id: "blurple", accent: "#5865f2", accent2: "#4752c4", bg: "#1e1f22", fg: "#dbdee1" },
  { id: "midnight", accent: "#7c5cff", accent2: "#5c40dc", bg: "#10101e", fg: "#e2e4f0" },
  { id: "aurora", accent: "#14b8a6", accent2: "#0d9488", bg: "#0a1818", fg: "#dcebe8" },
  { id: "sunset", accent: "#f4725e", accent2: "#db5446", bg: "#1a1016", fg: "#f0e2e6" },
  { id: "crimson", accent: "#ef4444", accent2: "#be282d", bg: "#180e10", fg: "#f0e0e2" },
  { id: "light", accent: "#5865f2", accent2: "#4752c4", bg: "#e4e6eb", fg: "#23262d" },
];

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const { user, updateProfile, logout } = useAuth();
  const { t } = useI18n();
  const lang = useSettings((s) => s.lang);
  const theme = useSettings((s) => s.theme);
  const setSettings = useSettings((s) => s.set);
  const [tab, setTab] = useState<"profile" | "voice" | "app" | "security">("profile");

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? "");
  const [bannerUrl, setBannerUrl] = useState(user?.bannerUrl ?? "");
  const [accentColor, setAccentColor] = useState(user?.accentColor ?? "#5865f2");
  const [customStatus, setCustomStatus] = useState(user?.customStatus ?? "");
  const [pronouns, setPronouns] = useState(user?.pronouns ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [status, setStatus] = useState<PresenceStatus>(user?.status ?? "ONLINE");

  const [server, setServer] = useState(getServerUrl());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showWhatsNew, setShowWhatsNew] = useState(false);

  if (!user) return null;

  async function saveProfile() {
    setBusy(true);
    setMsg(null);
    try {
      await updateProfile({
        displayName: displayName.trim() || user!.username,
        avatarUrl: avatarUrl.trim() || null,
        bannerUrl: bannerUrl.trim() || null,
        accentColor: accentColor || null,
        customStatus: customStatus.trim() || null,
        pronouns: pronouns.trim() || null,
        bio: bio.trim() || null,
        status,
      });
      setMsg(t("settings.saved"));
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function saveServer() {
    setServerUrl(server);
    setMsg("Server URL saved — reconnect by reloading.");
  }

  return (
    <Modal title={t("settings.title")} onClose={onClose} wide>
      <div className="mb-5 flex gap-2 overflow-x-auto border-b border-black/20 pb-3">
        <Tab active={tab === "profile"} onClick={() => setTab("profile")}>{t("settings.tab.profile")}</Tab>
        <Tab active={tab === "voice"} onClick={() => setTab("voice")}>{t("settings.tab.voice")}</Tab>
        <Tab active={tab === "app"} onClick={() => setTab("app")}>{t("settings.tab.app")}</Tab>
        <Tab active={tab === "security"} onClick={() => setTab("security")}>{t("settings.tab.security")}</Tab>
      </div>

      {tab === "voice" ? (
        <VoiceSettings />
      ) : tab === "security" ? (
        <SecuritySettings />
      ) : tab === "profile" ? (
        <div className="space-y-4">
          {/* Live banner + avatar preview */}
          <div
            className="relative mb-8 h-24 rounded-lg"
            style={{
              background: bannerUrl
                ? `center/cover no-repeat url(${bannerUrl})`
                : accentColor,
            }}
          >
            <div className="absolute -bottom-6 left-4">
              <Avatar
                user={{ username: user.username, displayName, avatarUrl }}
                size={64}
                status={status}
              />
            </div>
          </div>
          <div className="text-sm text-discord-muted">
            {user.username}#{user.discriminator}
            {pronouns.trim() && <span className="ml-2 text-discord-faint">· {pronouns}</span>}
          </div>

          <Field label={t("settings.displayName")} value={displayName} onChange={setDisplayName} />
          <Field label={t("settings.pronouns")} value={pronouns} onChange={setPronouns} placeholder={t("settings.pronounsPlaceholder")} />
          <Field label={t("settings.avatarUrl")} value={avatarUrl} onChange={setAvatarUrl} placeholder="https://…/avatar.png" />
          <Field label={t("settings.bannerUrl")} value={bannerUrl} onChange={setBannerUrl} placeholder="https://…/banner.png" />
          <Field label={t("settings.customStatus")} value={customStatus} onChange={setCustomStatus} placeholder={t("settings.customStatusPlaceholder")} />

          <div>
            <label className="text-xs font-bold uppercase text-discord-muted">{t("settings.status")}</label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`rounded px-3 py-1.5 text-sm ${status === s ? "bg-discord-accent text-white" : "bg-discord-card text-discord-muted hover:text-white"}`}
                >
                  {t(`status.${s}` as never)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold uppercase text-discord-muted">{t("settings.bannerColor")}</label>
            <input
              type="color"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              className="mt-1.5 block h-10 w-20 cursor-pointer rounded bg-transparent"
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase text-discord-muted">{t("settings.aboutMe")}</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              maxLength={4000}
              className="mt-1.5 w-full resize-none rounded bg-discord-deep px-3 py-2 text-discord-text outline-none focus:ring-1 focus:ring-discord-accent"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={saveProfile}
              disabled={busy}
              className="rounded bg-discord-accent px-5 py-2 font-medium text-white hover:bg-discord-accentDark disabled:opacity-60"
            >
              {busy ? t("settings.saving") : t("settings.saveProfile")}
            </button>
            {msg && <span className="text-sm text-discord-muted">{msg}</span>}
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Theme */}
          <div>
            <label className="text-xs font-bold uppercase text-discord-muted">{t("settings.theme")}</label>
            <p className="mb-2 mt-0.5 text-xs text-discord-faint">{t("settings.themeDesc")}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {THEMES.map((th) => (
                <button
                  key={th.id}
                  onClick={() => setSettings({ theme: th.id })}
                  className={`flex items-center gap-2 rounded-lg p-2 ring-2 transition ${
                    theme === th.id ? "ring-discord-accent" : "ring-transparent hover:ring-white/20"
                  }`}
                  style={{ background: th.bg }}
                >
                  <span
                    className="h-6 w-6 shrink-0 rounded-full"
                    style={{ background: `linear-gradient(135deg, ${th.accent}, ${th.accent2})` }}
                  />
                  <span className="truncate text-sm" style={{ color: th.fg }}>
                    {t(`theme.${th.id}` as never)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <hr className="border-black/20" />

          {/* Language */}
          <div>
            <label className="text-xs font-bold uppercase text-discord-muted">{t("settings.language")}</label>
            <p className="mb-2 mt-0.5 text-xs text-discord-faint">{t("settings.languageDesc")}</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(LANGUAGES) as Lang[]).map((code) => (
                <button
                  key={code}
                  onClick={() => setSettings({ lang: code })}
                  className={`rounded px-4 py-2 text-sm font-medium ${lang === code ? "bg-discord-accent text-white" : "bg-discord-card text-discord-muted hover:text-white"}`}
                >
                  {LANGUAGES[code]}
                </button>
              ))}
            </div>
          </div>

          <hr className="border-black/20" />

          {!serverPinned && (
            <>
              <Field label={t("settings.serverUrl")} value={server} onChange={setServer} placeholder="http://localhost:4000" />
              <div className="flex items-center gap-3">
                <button onClick={saveServer} className="rounded bg-discord-accent px-5 py-2 font-medium text-white hover:bg-discord-accentDark">
                  {t("settings.saveServerUrl")}
                </button>
                {msg && <span className="text-sm text-discord-muted">{msg}</span>}
              </div>
              <hr className="border-black/20" />
            </>
          )}

          <button
            onClick={() => logout()}
            className="rounded bg-discord-danger px-5 py-2 font-medium text-white hover:bg-discord-dangerDark"
          >
            {t("settings.logout")}
          </button>

          <div className="flex items-center gap-3 pt-2 text-xs text-discord-faint">
            <span className="rounded bg-discord-card px-2 py-1 font-mono">Concord</span>
            <span>{t("settings.version")} {appVersion()}</span>
            <button onClick={() => setShowWhatsNew(true)} className="text-discord-link hover:underline">
              {t("settings.whatsNew")}
            </button>
          </div>
        </div>
      )}
      {showWhatsNew && <WhatsNewModal entries={recentChanges()} onClose={() => setShowWhatsNew(false)} />}
    </Modal>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded px-3 py-1.5 text-sm font-medium ${active ? "bg-discord-card text-white" : "text-discord-muted hover:text-white"}`}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-xs font-bold uppercase text-discord-muted">{label}</label>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded bg-discord-deep px-3 py-2.5 text-discord-text outline-none focus:ring-1 focus:ring-discord-accent"
      />
    </div>
  );
}
