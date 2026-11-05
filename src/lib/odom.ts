/**
 * The G1's own odometry and its walk to a point, for the Navigation page. Pure: no React, no
 * network, so it is tested on its own (odom.test.ts).
 *
 *   pose   — /ws/odom: rt/state_estimator/odom_torso as g1_odom_bridge prints it (robot-command-
 *            relay): x, y, yaw in the "odom" frame, whose origin is wherever the robot BOOTED. It
 *            is not a frame of the room: two sessions' trails do not line up.
 *   walk   — POST /api/walk: the relay's Walk, the planner's contract (G1.md §6.9).
 *
 * Measured 2026-11-05: 1.978 m reported for 2 m walked, nothing drifting while standing.
 */
import { t } from "../i18n";
import type { Status } from "../components/ui/StatusText";

export interface Pose {
  x: number;
  y: number;
  yaw: number;
}

export interface OdomFrame extends Pose {
  t: number;
  ageMs: number;
  z: number;
}

export type OdomMessage =
  | { kind: "frame"; frame: OdomFrame }
  | { kind: "stale" }
  | { kind: "error"; error: string; final: boolean };

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function parseOdomMessage(text: string): OdomMessage | null {
  let d: unknown;
  try {
    d = JSON.parse(text);
  } catch {
    return null;
  }
  if (!d || typeof d !== "object") return null;
  const o = d as Record<string, unknown>;
  if (typeof o.error === "string") return { kind: "error", error: o.error, final: !!o.final };
  if (o.stale === true) return { kind: "stale" };
  // age_ms -1 = the bridge has never heard the robot: nothing to draw yet.
  if (!num(o.t) || !num(o.age_ms) || o.age_ms < 0) return { kind: "stale" };
  if (!num(o.x) || !num(o.y) || !num(o.yaw)) return null;
  return {
    kind: "frame",
    frame: { t: o.t, ageMs: o.age_ms, x: o.x, y: o.y, z: num(o.z) ? o.z : 0, yaw: o.yaw },
  };
}

/** The lidar's obstacle map (g1_lidar_bridge in robot-command-relay, coarsened for the page):
 * occupied squares of `res` metres in the odometry frame — square (ix, iy) covers
 * [ix*res, (ix+1)*res). `odom` false = no odometry on the robot: the squares are then in the
 * robot's own frame and do not line up with the trail. */
export interface LidarFrame {
  ageMs: number;
  ptsS: number;
  floor: number;
  tiltDeg: number;
  odom: boolean;
  res: number;
  cells: [number, number][];
}

export type LidarMessage =
  | { kind: "frame"; frame: LidarFrame }
  | { kind: "stale" }
  | { kind: "error"; error: string; final: boolean };

export function parseLidarMessage(text: string): LidarMessage | null {
  let d: unknown;
  try {
    d = JSON.parse(text);
  } catch {
    return null;
  }
  if (!d || typeof d !== "object") return null;
  const o = d as Record<string, unknown>;
  if (typeof o.error === "string") return { kind: "error", error: o.error, final: !!o.final };
  if (o.stale === true || !num(o.age_ms) || o.age_ms < 0) return { kind: "stale" };
  if (!num(o.res) || !Array.isArray(o.cells)) return null;
  const cells = o.cells.filter(
    (c): c is [number, number] => Array.isArray(c) && c.length === 2 && num(c[0]) && num(c[1]),
  );
  return {
    kind: "frame",
    frame: {
      ageMs: o.age_ms, ptsS: num(o.pts_s) ? o.pts_s : 0, floor: num(o.floor) ? o.floor : 0,
      tiltDeg: num(o.tilt_deg) ? o.tilt_deg : 0, odom: o.odom === 1 || o.odom === true,
      res: o.res, cells,
    },
  };
}

/** The 3D cloud (g1_lidar_bridge's "cloud" lines): `positions` is x, y, z in metres — x, y in the
 * odometry frame, z over the floor — three numbers per point, ready for a three.js buffer. */
export interface CloudFrame {
  ageMs: number;
  t: number;
  res: number;
  count: number;
  positions: Float32Array;
}

export type CloudMessage =
  | { kind: "frame"; frame: CloudFrame }
  | { kind: "stale" }
  | { kind: "error"; error: string; final: boolean };

/** Base64 of little-endian int16 centimetres -> metres. */
export function decodeCloud(b64: string): Float32Array {
  const bin = atob(b64);
  const n = Math.floor(bin.length / 2);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
    if (v >= 0x8000) v -= 0x10000;
    out[i] = v / 100;
  }
  return out;
}

export function parseCloudMessage(text: string): CloudMessage | null {
  let d: unknown;
  try {
    d = JSON.parse(text);
  } catch {
    return null;
  }
  if (!d || typeof d !== "object") return null;
  const o = d as Record<string, unknown>;
  if (typeof o.error === "string") return { kind: "error", error: o.error, final: !!o.final };
  if (o.stale === true) return { kind: "stale" };
  if (o.kind !== "cloud" || typeof o.xyz !== "string" || !num(o.res)) return null;
  const positions = decodeCloud(o.xyz);
  return {
    kind: "frame",
    frame: { ageMs: 0, t: num(o.t) ? o.t : 0, res: o.res, count: positions.length / 3, positions },
  };
}

/** A new trail point only once the robot has moved this far: standing still adds nothing, and
 * the torso's sway in place (~10 cm turning) stays a smudge rather than thousands of points. */
export const TRAIL_STEP_M = 0.03;
export const TRAIL_MAX = 4000;

export function extendTrail(trail: Pose[], p: Pose): Pose[] {
  const last = trail[trail.length - 1];
  if (last && Math.hypot(p.x - last.x, p.y - last.y) < TRAIL_STEP_M) return trail;
  const next = trail.length >= TRAIL_MAX ? trail.slice(trail.length - TRAIL_MAX + 1) : trail.slice();
  next.push({ x: p.x, y: p.y, yaw: p.yaw });
  return next;
}

export interface View {
  cx: number;
  cy: number;
  /** Metres from the centre to the nearest edge. */
  half: number;
}

/** A square view that holds every point given with a margin, never smaller than `minHalf` m
 * (a robot standing still is not shown as a blur filling the screen). */
export function fitView(points: { x: number; y: number }[], minHalf = 1.5, margin = 0.6): View {
  if (!points.length) return { cx: 0, cy: 0, half: minHalf };
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of points) {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
  }
  return {
    cx: (x0 + x1) / 2,
    cy: (y0 + y1) / 2,
    half: Math.max(minHalf, (x1 - x0) / 2 + margin, (y1 - y0) / 2 + margin),
  };
}

/** Where a goto ends, in the odom frame, if asked now from `p`: dx forward, dy left, dyaw left.
 * The same arithmetic as relay_server.Walk, so the page can draw the target before sending. */
export function goalFrom(p: Pose, dx: number, dy: number, dyaw: number): Pose {
  const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  return { x: p.x + c * dx - s * dy, y: p.y + s * dx + c * dy, yaw: wrap(p.yaw + dyaw) };
}

export function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

export const deg = (rad: number) => (rad * 180) / Math.PI;
export const rad = (degrees: number) => (degrees * Math.PI) / 180;

// ------------------------------------------------------------------------------------------
// The walk
// ------------------------------------------------------------------------------------------
export type WalkState =
  | "idle" | "starting" | "running" | "success" | "uncertain" | "failure" | "cancelled"
  | "unavailable";

export interface WalkStatus {
  id?: number;
  state: WalkState;
  phase?: "translate" | "turn" | "done";
  request?: { dx: number; dy: number; dyaw: number };
  start?: Pose | null;
  goal?: Pose | null;
  pose?: Pose | null;
  error?: { pos_m: number; yaw_deg: number } | null;
  reason?: string | null;
  elapsed_s?: number;
  limit_s?: number;
  /** Set while something is in the way and the robot waits for it to move off. */
  blocked?: { dist_m: number } | null;
  /** The way it planned round what the lidar saw, odom frame, start to goal. */
  path?: [number, number][] | null;
  /** "lidar" when the walk looks where it goes, "none" when it walks blind. */
  eyes?: "lidar" | "none";
}

export const walkRunning = (w: WalkStatus | null) =>
  !!w && (w.state === "starting" || w.state === "running");

/** One status line for a walk, worded for the operator. Reasons come from the robot, as-is. */
export function walkLine(w: WalkStatus | null): Status | null {
  if (!w || w.state === "idle") return null;
  const err = w.error ? t("{cm} cm and {deg}° off", {
    cm: Math.round(w.error.pos_m * 100), deg: Math.abs(w.error.yaw_deg).toFixed(0),
  }) : "";
  switch (w.state) {
    case "starting":
      return { tone: "busy", text: t("Starting the walk…") };
    case "running":
      if (w.blocked)
        return {
          tone: "warn",
          text: t("Something {d} m ahead: waiting for the way to clear", { d: w.blocked.dist_m.toFixed(2) }),
        };
      return {
        tone: "busy",
        text: w.phase === "turn"
          ? t("Turning in place · {err}", { err })
          : t("Walking to the point · {err}", { err }),
      };
    case "success":
      return { tone: "ok", text: t("Arrived · {err}", { err }) };
    case "uncertain":
      return { tone: "warn", text: t("Stopped, but further off than expected · {err}", { err }) };
    case "cancelled":
      return { tone: "stopped", text: t("Stopped: {reason}", { reason: w.reason ?? "" }) };
    case "failure":
      return { tone: "error", text: t("The walk failed: {reason}", { reason: w.reason ?? "" }) };
    case "unavailable":
      return { tone: "blocked", text: t("This robot cannot walk to a point (the relay has no odometry bridge).") };
  }
}
