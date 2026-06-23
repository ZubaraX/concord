import { useEffect } from "react";
import { useAuth } from "./store/auth";
import AuthPage from "./pages/AuthPage";
import AppLayout from "./pages/AppLayout";

export default function App() {
  const { user, loading, hydrate } = useAuth();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-discord-rail text-discord-muted">
        <div className="animate-pulse text-lg">Connecting to Concord…</div>
      </div>
    );
  }

  return user ? <AppLayout /> : <AuthPage />;
}
