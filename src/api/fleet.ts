// Sites and robots. Reading needs "view"; changing needs "configure" (admins, owners).
import { BACKEND_URL } from "../config";
import { backendFetch } from "./backend";
import { AuthError } from "./auth";

export interface Site {
  id: string;
  name: string;
  timezone: string;
  address: string;
  lat: number | null;
  lon: number | null;
  has_plan: boolean;
}

export interface FleetRobot {
  id: string;
  name: string;
  /** How the running stack addresses it: "go2" | "g1" (one robot per slot for now). */
  slot: string;
  model: string;
  serial: string;
  site_id: string | null;
}

export interface Fleet {
  sites: Site[];
  robots: FleetRobot[];
  slots: { slot: string; model: string; free: boolean }[];
  /** Satellite tile URL (with this server's key), or null when it has none. */
  satellite: string | null;
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

export async function getFleet(signal?: AbortSignal): Promise<Fleet> {
  return (await check(await backendFetch("/api/fleet", { signal }))).json();
}

export interface SiteInput {
  name?: string;
  timezone?: string;
  address?: string;
  lat?: number | null;
  lon?: number | null;
  clear_location?: boolean;
}

export async function saveSite(id: string | null, input: SiteInput): Promise<Site> {
  const r = id
    ? await backendFetch(`/api/sites/${encodeURIComponent(id)}`, json("PATCH", input))
    : await backendFetch("/api/sites", json("POST", input));
  return (await check(r)).json();
}

export async function deleteSite(id: string): Promise<void> {
  await check(await backendFetch(`/api/sites/${encodeURIComponent(id)}`, { method: "DELETE" }));
}

/** The floor plan goes up as the raw file body; the backend checks its bytes and size. */
export async function uploadPlan(id: string, file: File): Promise<Site> {
  const r = await backendFetch(`/api/sites/${encodeURIComponent(id)}/plan`, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  return (await check(r)).json();
}

export async function deletePlan(id: string): Promise<Site> {
  return (await check(await backendFetch(`/api/sites/${encodeURIComponent(id)}/plan`, { method: "DELETE" }))).json();
}

/** Where the plan image is served (an <img> sends the session cookie on its own). */
export function planUrl(site: Site, version = 0): string {
  return `${BACKEND_URL}/api/sites/${encodeURIComponent(site.id)}/plan?v=${version}`;
}

export interface RobotInput {
  name?: string;
  slot?: string;
  serial?: string;
  site_id?: string | null;
  unassign?: boolean;
}

export async function saveRobot(id: string | null, input: RobotInput): Promise<FleetRobot> {
  const r = id
    ? await backendFetch(`/api/robots/${encodeURIComponent(id)}`, json("PATCH", input))
    : await backendFetch("/api/robots", json("POST", input));
  return (await check(r)).json();
}

export async function deleteRobot(id: string): Promise<void> {
  await check(await backendFetch(`/api/robots/${encodeURIComponent(id)}`, { method: "DELETE" }));
}

export interface ActivityEvent {
  at: string;
  action: string;
  target: string;
  actor: string;
  detail: Record<string, unknown>;
}

/** Notable changes in the company, newest first (admins: the log names people). */
export async function getActivity(signal?: AbortSignal): Promise<ActivityEvent[]> {
  return (await check(await backendFetch("/api/activity", { signal }))).json();
}
