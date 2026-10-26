import { useCallback } from "react";
import { useAuth } from "./AuthContext";

/** What a role may do. The backend enforces every one of these on every request (auth.POLICY);
 * the UI asks only to hide what would fail. */
export type Permission = "view" | "analyze" | "operate" | "configure" | "manage_users" | "manage_org";

/** `can("operate")` for the signed-in person; false while nobody is signed in. */
export function useCan(): (perm: Permission) => boolean {
  const { status } = useAuth();
  const perms = status.kind === "signed-in" ? status.me.permissions : null;
  return useCallback((perm: Permission) => !!perms?.includes(perm), [perms]);
}
