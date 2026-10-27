// Sites and robots. Reading needs "view"; changing needs "configure" (admins, owners).
import { BACKEND_URL } from "../config";
import { backendFetch } from "./backend";
import { AuthError } from "./auth";
import { msg, t } from "../i18n";

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
  /** Its colour (lib/colors.ts): random when registered, changeable in its dialog. */
  color: string;
  /** Last known state, kept by the server whether or not anyone is watching. Null fields:
   * never measured (no ping address yet). */
  status: {
    online: boolean | null;
    since: string | null;
    last_seen_at: string | null;
    latency_ms: number | null;
    /** How commands reach it: "relay" (the agent on the robot) or "dds" (same network). */
    link: string | null;
    battery_pct: number | null;
    battery_charging: boolean | null;
    battery_at: string | null;
  };
}

export interface Fleet {
  sites: Site[];
  robots: FleetRobot[];
  slots: { slot: string; model: string; free: boolean }[];
  /** Satellite tile URL (with this server's key), or null when it has none. */
  satellite: string | null;
}

/** Said when the server does not know a route this page uses: the app was updated and the
 * server not restarted, so the page is newer than the server behind it. */
export const OUTDATED_SERVER = msg("This server is running an older version of Pilot. Restart it to finish the update.");

/** A failed response as an error the person can read (the backend writes `detail` for people).
 * A route the server has never heard of — 405, or FastAPI's bare "Not Found" (ours always say
 * what was not found) — means an outdated server, and says so instead of an HTTP phrase. */
export async function check(r: Response): Promise<Response> {
  if (r.ok) return r;
  let message: string | null = null;
  try {
    const body = (await r.json()) as { detail?: unknown };
    if (typeof body.detail === "string") message = body.detail;
    else if (Array.isArray(body.detail) && body.detail[0]?.msg) message = String(body.detail[0].msg);
  } catch {
    /* keep the generic message */
  }
  if (r.status === 405 || (r.status === 404 && message === "Not Found")) message = OUTDATED_SERVER;
  // Translated as the error is made. The server writes its texts in English and they match the
  // SERVER dictionary (i18n/es/server.ts) exactly; one it does not list stays as it came.
  throw new AuthError(r.status, message === null ? t("Something went wrong ({status}).", { status: r.status }) : t(message));
}

export const json = (method: string, body: unknown): RequestInit => ({
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
  color?: string;
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
  id: string;
  at: string;
  action: string;
  target: string;
  actor: string;
  detail: Record<string, unknown>;
}

export interface ActivityPage {
  events: ActivityEvent[];
  /** How many match in all, for the page numbers. */
  total: number;
}

export type ActivityKind = "people" | "access" | "sites" | "robots";

/** Notable changes in the company, newest first, a page at a time (admins: the log names
 * people). */
export async function getActivity(signal?: AbortSignal, page?: { limit: number; offset: number; kind?: ActivityKind | null }): Promise<ActivityPage> {
  const q = new URLSearchParams();
  if (page) {
    q.set("limit", String(page.limit));
    q.set("offset", String(page.offset));
    if (page.kind) q.set("kind", page.kind);
  }
  return (await check(await backendFetch(`/api/activity${q.size ? `?${q}` : ""}`, { signal }))).json();
}

export interface Notifications {
  events: (ActivityEvent & { unread: boolean })[];
  unread: number;
}

/** The bell: the latest events you may see (not your own doings), and how many are new. */
export async function getNotifications(signal?: AbortSignal): Promise<Notifications> {
  return (await check(await backendFetch("/api/notifications", { signal }))).json();
}

export async function markNotificationsSeen(): Promise<void> {
  await check(await backendFetch("/api/notifications/seen", { method: "POST" }));
}
