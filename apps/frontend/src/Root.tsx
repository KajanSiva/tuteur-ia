import { useCallback, useEffect, useState } from "react";
import type { AuthState } from "@tuteur/shared";

import App from "./App";
import { fetchAuthState, logout } from "./lib/auth";
import { Login } from "./pages/Login";
import { Onboarding } from "./pages/Onboarding";
import { ParentDashboard } from "./pages/ParentDashboard";

// Auth gate: uninitialized install → onboarding; no session → login;
// then the parent space or the child chat depending on the signed-in role.
export function Root() {
  const [state, setState] = useState<AuthState | null>(null);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setState(await fetchAuthState());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleLogout = useCallback(async () => {
    await logout();
    await refresh();
  }, [refresh]);

  if (failed) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <p className="text-sm text-muted-foreground">
          Le serveur ne répond pas.{" "}
          <button
            type="button"
            className="font-medium text-foreground underline"
            onClick={() => void refresh()}
          >
            Réessayer
          </button>
        </p>
      </div>
    );
  }
  if (!state) {
    return null;
  }
  if (!state.initialized) {
    return <Onboarding onDone={() => void refresh()} />;
  }
  if (!state.user) {
    return <Login onDone={() => void refresh()} />;
  }
  if (state.user.role === "parent") {
    return (
      <ParentDashboard user={state.user} onLogout={() => void handleLogout()} />
    );
  }
  return <App user={state.user} onLogout={() => void handleLogout()} />;
}
