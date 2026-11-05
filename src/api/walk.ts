// The Navigation page's calls: walk the G1 to a point relative to where it stands, cancel it,
// read how it is going. The loop runs on the robot (robot-command-relay, relay_server.Walk).
import { backendFetch } from "./backend";
import type { WalkStatus } from "../lib/odom";

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
