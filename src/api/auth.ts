// Sign-in, first-run setup and the current user. The session lives in an httpOnly cookie the
// backend sets: this code never sees or stores a token, and nothing here touches localStorage.
import { backendFetch } from "./backend";

export type Role = "viewer" | "operator" | "admin" | "owner";

export interface Me {
  user: { id: string; name: string; email: string };
  org: { id: string; name: string };
  role: Role;
  permissions: string[];
}

export interface AuthState {
  setup_required: boolean;
  org_name: string | null;
}

/** An error the user should read as-is (the backend writes them for people). */
export class AuthError extends Error {
  status: number;
  retryAfter: number | null;
  constructor(status: number, message: string, retryAfter: number | null = null) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

async function readError(r: Response): Promise<AuthError> {
  let message = `Something went wrong (${r.status}). Try again.`;
  try {
    const body = (await r.json()) as { detail?: unknown };
    if (typeof body.detail === "string") message = body.detail;
    // FastAPI validation errors: a list of {msg}. Show the first, without the field path.
    else if (Array.isArray(body.detail) && body.detail[0]?.msg) message = String(body.detail[0].msg);
  } catch {
    /* not JSON: keep the generic message */
  }
  const ra = Number(r.headers.get("retry-after"));
  return new AuthError(r.status, message, Number.isFinite(ra) && ra > 0 ? ra : null);
}

export async function getAuthState(signal?: AbortSignal): Promise<AuthState> {
  const r = await backendFetch("/api/auth/state", { signal });
  if (!r.ok) throw await readError(r);
  return r.json();
}

/** The signed-in person, or null when nobody is (401). Does not report the 401 as a
 * sign-out: asking "who am I" on load is how the app finds out in the first place. */
export async function getMe(signal?: AbortSignal): Promise<Me | null> {
  const r = await backendFetch("/api/auth/me", { signal }, { quiet401: true });
  if (r.status === 401) return null;
  if (!r.ok) throw await readError(r);
  return r.json();
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const r = await backendFetch(
    path,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    { quiet401: true },
  );
  if (!r.ok) throw await readError(r);
  return r.json();
}

export function signIn(email: string, password: string, remember: boolean): Promise<Me> {
  return postJson("/api/auth/login", { email, password, remember });
}

export interface SetupInput {
  setup_code: string;
  org_name: string;
  name: string;
  email: string;
  password: string;
}

export function setUp(input: SetupInput): Promise<Me> {
  return postJson("/api/auth/setup", input);
}

export async function signOut(): Promise<void> {
  await backendFetch("/api/auth/logout", { method: "POST" }, { quiet401: true });
}

/** Your own name (Settings → Profile). Returns who you are now. */
export async function updateProfile(name: string): Promise<Me> {
  const r = await backendFetch("/api/auth/me", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
  });
  if (!r.ok) throw await readError(r);
  return r.json();
}

/** Your own password; every other session of yours is signed out. */
export async function changePassword(current_password: string, new_password: string): Promise<{ signed_out: number }> {
  const r = await backendFetch("/api/auth/password", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ current_password, new_password }),
  });
  if (!r.ok) throw await readError(r);
  return r.json();
}
