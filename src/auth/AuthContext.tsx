import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { getAuthState, getMe, setUp, signIn, signOut, type SsoOption } from "../api/auth";
import { acceptInvitation, completePasswordReset } from "../api/team";
import type { Me, SetupInput } from "../api/auth";
import { onSignedOut } from "./signedOut";
import { loadPrefs } from "../lib/prefs";
import { applyTheme, savedTheme } from "../lib/theme";
import { applyLanguage } from "../i18n";

/** Signed in: the person's own preferences into this browser first (theme, voice, volume…),
 * so the app opens the way they left it on any computer. */
async function arrive(me: Me): Promise<Me> {
  await loadPrefs(me.user.id);
  applyTheme(savedTheme());
  applyLanguage();
  return me;
}

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
  /** The company's single sign-on button, read with the rest of the sign-in state before any
   * screen shows — so the sign-in page never flips from the password form to the button. */
  sso: SsoOption | null;
  signIn: (email: string, password: string, remember: boolean) => Promise<void>;
  setUp: (input: SetupInput) => Promise<void>;
  acceptInvitation: (token: string, name: string, password: string, remember: boolean) => Promise<void>;
  completePasswordReset: (token: string, password: string, remember: boolean) => Promise<void>;
  signOut: () => Promise<void>;
  retry: () => void;
  /** Replace who you are after changing it (a new name in Profile). */
  setMe: (me: Me) => void;
}

const AuthContext = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>({ kind: "loading" });
  const [sso, setSso] = useState<SsoOption | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ctl = new AbortController();
    (async () => {
      try {
        const state = await getAuthState(ctl.signal);
        setSso(state.sso ?? null);
        if (state.setup_required) return setStatus({ kind: "setup" });
        const me = await getMe(ctl.signal);
        if (me) await arrive(me);
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
    const me = await arrive(await signIn(email, password, remember));
    setStatus({ kind: "signed-in", me });
  }, []);

  const doSetUp = useCallback(async (input: SetupInput) => {
    const me = await arrive(await setUp(input));
    setStatus({ kind: "signed-in", me });
  }, []);

  const doAccept = useCallback(
    async (token: string, name: string, password: string, remember: boolean) => {
      const me = await arrive(await acceptInvitation(token, name, password, remember));
      // Leave /invite#token=… behind: the link is spent, and the app opens on Live.
      history.replaceState(null, "", "/");
      setStatus({ kind: "signed-in", me });
    },
    [],
  );

  const doReset = useCallback(async (token: string, password: string, remember: boolean) => {
    const me = await arrive(await completePasswordReset(token, password, remember));
    history.replaceState(null, "", "/");
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

  const setMe = useCallback((me: Me) => setStatus({ kind: "signed-in", me }), []);

  const api = useMemo(
    () => ({
      status, sso, signIn: doSignIn, setUp: doSetUp, acceptInvitation: doAccept,
      completePasswordReset: doReset, signOut: doSignOut, retry, setMe,
    }),
    [status, sso, doSignIn, doSetUp, doAccept, doReset, doSignOut, retry, setMe],
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
