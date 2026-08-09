import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../store/auth";
import { useSettings } from "../store/settings";
import { useI18n, LANGUAGES, type Lang } from "../lib/i18n";
import { appVersion, recentChanges } from "../lib/changelog";
import WhatsNewModal from "./WhatsNewModal";
import { getServerUrl, setServerUrl, serverPinned, serverPath } from "../lib/serverUrl";
import { uploadFile } from "../api/client";
import { maybeCompressImage } from "../lib/imageCompress";
import type { PresenceStatus } from "../types";
import { XIcon } from "./Icons";
import Marquee from "./Marquee";
import Avatar from "./Avatar";
import VoiceSettings from "./VoiceSettings";
import SecuritySettings from "./SecuritySettings";
import ImageCropModal from "./ImageCropModal";

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
  const effects = useSettings((s) => s.effects);
  const gameActivity = useSettings((s) => s.gameActivity);
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
  const [uploading, setUploading] = useState<"avatar" | "banner" | null>(null);
  // A picked file waiting to be positioned in the cropper before upload.
  const [cropFile, setCropFile] = useState<{ kind: "avatar" | "banner"; file: File } | null>(null);
  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  if (!user) return null;

  // Picking a file opens the cropper; the cropper hands back a positioned image
  // which we then upload.
  async function uploadCropped(kind: "avatar" | "banner", file: File) {
    setUploading(kind);
    setMsg(null);
    try {
      const up = await uploadFile(await maybeCompressImage(file));
      if (kind === "avatar") setAvatarUrl(up.url);
      else setBannerUrl(up.url);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setUploading(null);
    }
  }

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
      // Remember the presence choice — restorePresence re-asserts it on every
      // (re)connect, and without this it would restore a stale value and the
      // status picked here would "not save".
      localStorage.setItem("concord.presence", status);
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

  const NAV: { id: typeof tab; icon: string; label: string }[] = [
    { id: "profile", icon: "👤", label: t("settings.tab.profile") },
    { id: "voice", icon: "🎙", label: t("settings.tab.voice") },
    { id: "app", icon: "🎨", label: t("settings.tab.app") },
    { id: "security", icon: "🔒", label: t("settings.tab.security") },
  ];

  // Full-screen settings (Discord-style): a section rail on the left, the
  // scrollable pane on the right. Phones get the rail as a top strip.
  return (
    <SettingsShell
      nav={NAV}
      tab={tab}
      setTab={setTab}
      title={NAV.find((n) => n.id === tab)?.label ?? t("settings.title")}
      onClose={onClose}
    >
      {tab === "voice" ? (
        <VoiceSettings />
      ) : tab === "security" ? (
        <SecuritySettings />
      ) : tab === "profile" ? (
        <div className="space-y-4">
          {/* Live banner + avatar preview */}
          <div
            className="relative mb-8 aspect-[8/3] max-h-44 rounded-lg"
            style={{
              background: bannerUrl
                ? `center/cover no-repeat url(${serverPath(bannerUrl)})`
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

          {/* Avatar + banner: upload a photo (no more pasting URLs). */}
          <div className="flex flex-wrap gap-2">
            <input ref={avatarInput} type="file" accept="image/*" hidden onChange={(e) => { if (e.target.files?.[0]) setCropFile({ kind: "avatar", file: e.target.files[0] }); e.target.value = ""; }} />
            <input ref={bannerInput} type="file" accept="image/*" hidden onChange={(e) => { if (e.target.files?.[0]) setCropFile({ kind: "banner", file: e.target.files[0] }); e.target.value = ""; }} />
            <button onClick={() => avatarInput.current?.click()} disabled={!!uploading} className="rounded bg-discord-card px-3 py-2 text-sm text-discord-text hover:bg-discord-hover disabled:opacity-60">
              {uploading === "avatar" ? "…" : `🖼 ${t("settings.uploadAvatar")}`}
            </button>
            {avatarUrl && (
              <button onClick={() => setAvatarUrl("")} className="rounded bg-discord-card px-3 py-2 text-sm text-discord-muted hover:text-discord-danger">
                {t("settings.removeAvatar")}
              </button>
            )}
            <button onClick={() => bannerInput.current?.click()} disabled={!!uploading} className="rounded bg-discord-card px-3 py-2 text-sm text-discord-text hover:bg-discord-hover disabled:opacity-60">
              {uploading === "banner" ? "…" : `🏞 ${t("settings.uploadBanner")}`}
            </button>
            {bannerUrl && (
              <button onClick={() => setBannerUrl("")} className="rounded bg-discord-card px-3 py-2 text-sm text-discord-muted hover:text-discord-danger">
                {t("settings.removeBanner")}
              </button>
            )}
          </div>

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

          {/* Visual effects level */}
          <div>
            <label className="text-xs font-bold uppercase text-discord-muted">{t("settings.effects")}</label>
            <p className="mb-2 mt-0.5 text-xs text-discord-faint">{t("settings.effectsDesc")}</p>
            <div className="flex flex-wrap gap-2">
              {(["off", "reduced", "full"] as const).map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => setSettings({ effects: lvl })}
                  className={`rounded px-4 py-2 text-sm font-medium ${effects === lvl ? "bg-discord-accent text-white" : "bg-discord-card text-discord-muted hover:text-white"}`}
                >
                  {t(`settings.fx.${lvl}` as never)}
                </button>
              ))}
            </div>
          </div>

          {window.concord?.isDesktop && (
            <>
              <hr className="border-black/20" />
              {/* "Playing …" game activity (desktop only) */}
              <div>
                <label className="text-xs font-bold uppercase text-discord-muted">{t("settings.gameActivity")}</label>
                <p className="mb-2 mt-0.5 text-xs text-discord-faint">{t("settings.gameActivityDesc")}</p>
                <button
                  onClick={() => setSettings({ gameActivity: !gameActivity })}
                  className={`rounded px-4 py-2 text-sm font-medium ${gameActivity ? "bg-discord-accent text-white" : "bg-discord-card text-discord-muted hover:text-white"}`}
                >
                  {gameActivity ? t("settings.gameActivityOn") : t("settings.gameActivityOff")}
                </button>
              </div>
            </>
          )}

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
      {cropFile && (
        <ImageCropModal
          file={cropFile.file}
          shape={cropFile.kind === "avatar" ? "circle" : "wide"}
          onCancel={() => setCropFile(null)}
          onCropped={(f) => {
            const kind = cropFile.kind;
            setCropFile(null);
            uploadCropped(kind, f);
          }}
        />
      )}
    </SettingsShell>
  );
}

// Full-screen settings surface: section rail (left on desktop, top strip on
// phones) + scrollable content, Esc to close — the Discord layout.
function SettingsShell<T extends string>({
  nav,
  tab,
  setTab,
  title,
  onClose,
  children,
}: {
  nav: { id: T; icon: string; label: string }[];
  tab: T;
  setTab: (t: T) => void;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState<T | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-discord-bg sm:flex-row">
      {/* Sections */}
      <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-black/30 bg-discord-sidebar p-2 text-[15px] sm:w-60 sm:flex-col sm:overflow-y-auto sm:border-b-0 sm:border-r sm:p-3 sm:pt-6 xl:w-72">
        <div className="hidden px-2 pb-2 text-[11px] font-bold uppercase tracking-wide text-discord-faint sm:block">
          {title}
        </div>
        {nav.map((n) => (
          <button
            key={n.id}
            onClick={() => setTab(n.id)}
            onMouseEnter={() => setHovered(n.id)}
            onMouseLeave={() => setHovered(null)}
            className={`flex shrink-0 items-center gap-2 rounded px-3 py-2 text-left text-sm font-medium transition sm:w-full sm:min-w-0 ${
              tab === n.id
                ? "bg-discord-active text-white"
                : "text-discord-muted hover:bg-discord-hover hover:text-discord-text"
            }`}
          >
            <span className="shrink-0 text-base leading-none">{n.icon}</span>
            {/* Long names ("Приложение / Подключение") scroll instead of being cut. */}
            <Marquee active={tab === n.id || hovered === n.id} className="min-w-0 flex-1 max-sm:w-auto max-sm:flex-none">
              {n.label}
            </Marquee>
          </button>
        ))}
      </nav>

      {/* Content — fills the window instead of hugging a narrow column, and
          scales its type up a notch on big screens. */}
      <div className="min-h-0 flex-1 overflow-y-auto text-[15px] xl:text-base">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-10 sm:py-10">
          <div className="mb-6 flex items-start justify-between gap-4">
            <h2 className="text-2xl font-bold text-white xl:text-3xl">{title}</h2>
            <button
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-discord-faint/40 text-discord-muted transition hover:bg-discord-hover hover:text-white"
              aria-label="Close"
              title="Esc"
            >
              <XIcon size={18} />
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>,
    document.body
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
