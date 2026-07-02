import { useEffect } from "react";
import { useAuth } from "./store/auth";
import { useSettings } from "./store/settings";
import { useI18n } from "./lib/i18n";
import AuthPage from "./pages/AuthPage";
import AppLayout from "./pages/AppLayout";
import UpdateOverlay from "./components/UpdateOverlay";

export default function App() {
  const { user, loading, hydrate } = useAuth();
  const { t } = useI18n();
  const theme = useSettings((s) => s.theme);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Apply the selected color theme to the whole document. The cc-theme-fade
  // class briefly enables color transitions so switching feels like a
  // crossfade, then drops off (permanent transitions slow the whole UI down).
  useEffect(() => {
    const el = document.documentElement;
    const first = !el.dataset.theme;
    if (!first) el.classList.add("cc-theme-fade");
    el.dataset.theme = theme;
    const id = setTimeout(() => el.classList.remove("cc-theme-fade"), 450);
    return () => clearTimeout(id);
  }, [theme]);

  return (
    <>
      {/* Sits above everything; only visible while an update is downloading. */}
      <UpdateOverlay />
      {loading ? (
        <div className="flex h-full items-center justify-center bg-discord-rail text-discord-muted">
          <div className="animate-pulse text-lg">{t("app.connecting")}</div>
        </div>
      ) : user ? (
        <AppLayout />
      ) : (
        <AuthPage />
      )}
    </>
  );
}
