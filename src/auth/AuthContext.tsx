import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { getAuthState, getMe, setUp, signIn, signOut } from "../api/auth";
import type { Me, SetupInput } from "../api/auth";
import { onSignedOut } from "./signedOut";

/**
 * Who is using the app. The backend is the authority — it checks the session and the role on
 * every request — so this only decides which screen to show and which controls to offer.
 *
 * - "loading": asking the backend (first paint only).
 * - "setup": a brand-new install with no accounts; the first-run wizard.
 * - "signed-out": the sign-in screen. `expired` says whether a session just ended under us,
 *   so the screen can say so instead of looking like a fresh visit.
 * - "signed-in": the app.
 * - "unreachable": the backend did not answer at all — a different problem from "not signed
 *   in", and it must not look like one.
 */
export type AuthStatus =
  | { kind: "loading" }
  | { kind: "unreachable" }
  | { kind: "setup" }
  | { kind: "signed-out"; orgName: string | null; expired: boolean }
  | { kind: "signed-in"; me: Me };

interface AuthApi {
  status: AuthStatus;
  signIn: (email: string, password: string, remember: boolean) => Promise<void>;
  setUp: (input: SetupInput) => Promise<void>;
  signOut: () => Promise<void>;
  retry: () => void;
}

const AuthContext = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ctl = new AbortController();
    (async () => {
      try {
        const state = await getAuthState(ctl.signal);
        if (state.setup_required) return setStatus({ kind: "setup" });
        const me = await getMe(ctl.signal);
        setStatus(me ? { kind: "signed-in", me }
          : { kind: "signed-out", orgName: state.org_name, expired: false });
      } catch (e) {
        if (!ctl.signal.aborted) {
          console.warn("auth: backend unreachable", e);
          setStatus({ kind: "unreachable" });
        }
      }
    })();
    return () => ctl.abort();
  }, [attempt]);

  // A 401 from any call while signed in: the session ended (expired, revoked, signed out in
  // another tab). Back to sign-in, keeping the org name for the screen.
  useEffect(
    () =>
      onSignedOut(() =>
        setStatus((s) =>
          s.kind === "signed-in"
            ? { kind: "signed-out", orgName: s.me.org.name, expired: true }
            : s,
        ),
      ),
    [],
  );

  const doSignIn = useCallback(async (email: string, password: string, remember: boolean) => {
    const me = await signIn(email, password, remember);
    setStatus({ kind: "signed-in", me });
  }, []);

  const doSetUp = useCallback(async (input: SetupInput) => {
    const me = await setUp(input);
    setStatus({ kind: "signed-in", me });
  }, []);

  const doSignOut = useCallback(async () => {
    const orgName = status.kind === "signed-in" ? status.me.org.name : null;
    try {
      await signOut();
    } finally {
      setStatus({ kind: "signed-out", orgName, expired: false });
    }
  }, [status]);

  const retry = useCallback(() => {
    setStatus({ kind: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  const api = useMemo(
    () => ({ status, signIn: doSignIn, setUp: doSetUp, signOut: doSignOut, retry }),
    [status, doSignIn, doSetUp, doSignOut, retry],
  );
  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside <AuthProvider>");
  return ctx;
}

/** The signed-in person. Only valid inside the signed-in app (AuthGate guarantees it). */
export function useMe(): Me {
  const { status } = useAuth();
  if (status.kind !== "signed-in") throw new Error("useMe while not signed in");
  return status.me;
}
