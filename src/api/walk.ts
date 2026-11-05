// The Navigation page's calls: walk the G1 to a point relative to where it stands, cancel it,
// read how it is going. The loop runs on the robot (robot-command-relay, relay_server.Walk).
import { backendFetch } from "./backend";
import type { Pose, WalkStatus } from "../lib/odom";

/** The way a walk WOULD take, from where the robot stands now; nothing moved to get it. */
export interface WalkPlan {
  start: Pose;
  goal: Pose;
  /** Odom-frame points from the robot to the goal; null when there is no way. */
  path: [number, number][] | null;
  eyes?: "lidar" | "none";
}

export interface PlanAnswer {
  ok: boolean;
  plan?: WalkPlan;
  error?: string;
}

/** Ask for the way (op plan): the page shows it and the operator accepts it with walkGoto. */
export async function walkPlan(dx: number, dy: number, dyaw: number): Promise<PlanAnswer> {
  const r = await backendFetch("/api/walk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ robot: "g1", op: "plan", dx, dy, dyaw }),
  });
  try {
    const body = (await r.json()) as PlanAnswer & { detail?: unknown };
    if (!body.ok && !body.error) body.error = typeof body.detail === "string" ? body.detail : `POST /api/walk -> ${r.status}`;
    return { ...body, ok: r.ok && !!body.ok };
  } catch {
    return { ok: false, error: `POST /api/walk -> ${r.status}` };
  }
}

export interface WalkAnswer {
  ok: boolean;
  walk?: WalkStatus;
  error?: string;
}

async function answer(r: Response, what: string): Promise<WalkAnswer> {
  try {
    const body = (await r.json()) as WalkAnswer & { detail?: unknown };
    if (!r.ok && !body.error) body.error = typeof body.detail === "string" ? body.detail : `${what} -> ${r.status}`;
    return { ...body, ok: r.ok && body.ok !== false };
  } catch {
    return { ok: false, error: `${what} -> ${r.status}` };
  }
}

/** MOVES THE ROBOT: dx m forward, dy m left, dyaw rad left, from where it stands now. */
export async function walkGoto(dx: number, dy: number, dyaw: number): Promise<WalkAnswer> {
  const r = await backendFetch("/api/walk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ robot: "g1", op: "goto", dx, dy, dyaw }),
  });
  return answer(r, "POST /api/walk");
}

/** Stops a walk in progress (the robot gets a stop_move). Harmless when nothing walks. */
export async function walkCancel(): Promise<WalkAnswer> {
  const r = await backendFetch("/api/walk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ robot: "g1", op: "cancel" }),
  });
  return answer(r, "POST /api/walk");
}

export async function walkStatus(signal?: AbortSignal): Promise<WalkAnswer> {
  const r = await backendFetch("/api/walk?robot=g1", { signal });
  return answer(r, "GET /api/walk");
}

/** Where the robot walked, recorded ON THE ROBOT whoever moved it: [x, y, yaw, t] per point. */
export async function fetchTrail(signal?: AbortSignal): Promise<[number, number, number, number][]> {
  const r = await backendFetch("/api/odom-trail?robot=g1", { signal });
  if (!r.ok) return [];
  const body = (await r.json()) as { points?: [number, number, number, number][] };
  return Array.isArray(body.points) ? body.points : [];
}

/** Start the trail again, for everyone (it lives on the robot). */
export async function clearTrail(): Promise<void> {
  await backendFetch("/api/odom-trail?robot=g1", { method: "POST" });
}
