import type { ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { AuthLoading, AuthUnreachable, SetupScreen, SignInScreen } from "./AuthScreens";

/** Renders the app only for a signed-in person; otherwise the screen that gets them there.
 * The URL is left alone, so signing in lands on the page that was asked for. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  switch (status.kind) {
    case "loading":
      return <AuthLoading />;
    case "unreachable":
      return <AuthUnreachable />;
    case "setup":
      return <SetupScreen />;
    case "signed-out":
      return <SignInScreen orgName={status.orgName} expired={status.expired} />;
    case "signed-in":
      return <>{children}</>;
  }
}
