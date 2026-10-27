// The team: members, invitations, roles. Managing it needs "manage_users" (admins, owners);
// joining through an invitation is public — the token in the link is the credential.
import { backendFetch } from "./backend";
import { AuthError } from "./auth";
import type { Me, Role } from "./auth";

export interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
  color: string;
  active: boolean;
  last_login_at: string | null;
  joined_at: string | null;
  you: boolean;
}

export interface Invitation {
  id: string;
  email: string;
  role: Role;
  invited_by: string;
  created_at: string;
  expires_at: string;
}

export interface Team {
  members: Member[];
  invitations: Invitation[];
}

async function check(r: Response): Promise<Response> {
  if (r.ok) return r;
  let message = `Something went wrong (${r.status}).`;
  try {
    const body = (await r.json()) as { detail?: unknown };
    if (typeof body.detail === "string") message = body.detail;
    else if (Array.isArray(body.detail) && body.detail[0]?.msg) message = String(body.detail[0].msg);
  } catch {
    /* keep the generic message */
  }
  throw new AuthError(r.status, message);
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export async function getTeam(signal?: AbortSignal): Promise<Team> {
  return (await check(await backendFetch("/api/team", { signal }))).json();
}

/** Returns the invitation and the link to hand over — the only time its token is visible. */
export async function invite(email: string, role: Role): Promise<{ invitation: Invitation; link: string }> {
  const r = await check(await backendFetch("/api/team/invitations", json("POST", { email, role })));
  const body = (await r.json()) as { invitation: Invitation; link_path: string };
  return { invitation: body.invitation, link: `${location.origin}${body.link_path}` };
}

export async function revokeInvitation(id: string): Promise<void> {
  await check(await backendFetch(`/api/team/invitations/${encodeURIComponent(id)}`, { method: "DELETE" }));
}

export async function updateMember(id: string, change: { role?: Role; active?: boolean }): Promise<void> {
  await check(await backendFetch(`/api/team/members/${encodeURIComponent(id)}`, json("PATCH", change)));
}

export interface InvitationInfo {
  email: string;
  role: Role;
  org_name: string;
  invited_by: string;
}

export async function lookupInvitation(token: string): Promise<InvitationInfo> {
  const r = await backendFetch("/api/invitations/lookup", json("POST", { token }), { quiet401: true });
  return (await check(r)).json();
}

export async function acceptInvitation(
  token: string, name: string, password: string, remember: boolean,
): Promise<Me> {
  const r = await backendFetch(
    "/api/invitations/accept", json("POST", { token, name, password, remember }), { quiet401: true },
  );
  return (await check(r)).json();
}

/** A one-time link for a member who forgot their password; valid 24 h, shown only now. */
export async function makePasswordReset(id: string): Promise<{ link: string; expires_at: string }> {
  const r = await check(await backendFetch(`/api/team/members/${encodeURIComponent(id)}/password-reset`, { method: "POST" }));
  const body = (await r.json()) as { link_path: string; expires_at: string };
  return { link: `${location.origin}${body.link_path}`, expires_at: body.expires_at };
}

export interface ResetInfo {
  email: string;
  name: string;
  org_name: string;
}

export async function lookupPasswordReset(token: string): Promise<ResetInfo> {
  const r = await backendFetch("/api/password-resets/lookup", json("POST", { token }), { quiet401: true });
  return (await check(r)).json();
}

export async function completePasswordReset(token: string, password: string, remember: boolean): Promise<Me> {
  const r = await backendFetch(
    "/api/password-resets/complete", json("POST", { token, password, remember }), { quiet401: true },
  );
  return (await check(r)).json();
}
