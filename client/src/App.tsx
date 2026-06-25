import { useEffect } from "react";
import { useAuth } from "./store/auth";
import AuthPage from "./pages/AuthPage";
import AppLayout from "./pages/AppLayout";
import UpdateOverlay from "./components/UpdateOverlay";

export default function App() {
  const { user, loading, hydrate } = useAuth();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <>
      {/* Sits above everything; only visible while an update is downloading. */}
      <UpdateOverlay />
      {loading ? (
        <div className="flex h-full items-center justify-center bg-discord-rail text-discord-muted">
          <div className="animate-pulse text-lg">Connecting to Concord…</div>
        </div>
      ) : user ? (
        <AppLayout />
      ) : (
        <AuthPage />
      )}
    </>
  );
}
