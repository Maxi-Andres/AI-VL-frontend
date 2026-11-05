import { describe, expect, it } from "vitest";
import {
  TRAIL_MAX,
  TRAIL_STEP_M,
  extendTrail,
  fitView,
  goalFrom,
  parseLidarMessage,
  parseOdomMessage,
  relativeTo,
  walkLine,
  wrap,
} from "./odom";

describe("parseOdomMessage", () => {
  it("reads a pose line as the bridge prints it", () => {
    const m = parseOdomMessage('{"t":1.5,"age_ms":12,"x":0.1,"y":-2,"z":1.3,"yaw":3.1,"vx":0}');
    expect(m).toEqual({ kind: "frame", frame: { t: 1.5, ageMs: 12, x: 0.1, y: -2, z: 1.3, yaw: 3.1 } });
  });
  it("treats a bridge that never heard the robot as stale, not as a pose at 0,0", () => {
    expect(parseOdomMessage('{"t":1,"age_ms":-1}')).toEqual({ kind: "stale" });
  });
  it("passes the gateway's final error on", () => {
    expect(parseOdomMessage('{"error":"relay down","final":true}')).toEqual({
      kind: "error", error: "relay down", final: true,
    });
  });
  it("drops garbage", () => {
    expect(parseOdomMessage("not json")).toBeNull();
    expect(parseOdomMessage('{"t":1,"age_ms":3,"x":"a","y":0,"yaw":0}')).toBeNull();
  });
});

describe("extendTrail", () => {
  it("adds a point only after the robot moved", () => {
    let tr = extendTrail([], { x: 0, y: 0, yaw: 0 });
    tr = extendTrail(tr, { x: TRAIL_STEP_M / 2, y: 0, yaw: 0 });
    expect(tr).toHaveLength(1);
    tr = extendTrail(tr, { x: TRAIL_STEP_M * 2, y: 0, yaw: 0 });
    expect(tr).toHaveLength(2);
  });
  it("keeps the newest points when full", () => {
    let tr = Array.from({ length: TRAIL_MAX }, (_, k) => ({ x: k, y: 0, yaw: 0 }));
    tr = extendTrail(tr, { x: TRAIL_MAX + 1, y: 0, yaw: 0 });
    expect(tr).toHaveLength(TRAIL_MAX);
    expect(tr[tr.length - 1].x).toBe(TRAIL_MAX + 1);
    expect(tr[0].x).toBe(1);
  });
});

describe("fitView", () => {
  it("never zooms in past the minimum, and holds every point", () => {
    expect(fitView([{ x: 1, y: 1 }]).half).toBe(1.5);
    const v = fitView([{ x: -4, y: 0 }, { x: 2, y: 1 }]);
    expect(v.cx).toBe(-1);
    expect(v.half).toBeGreaterThanOrEqual(3);
  });
});

describe("goalFrom", () => {
  it("is relative to where the robot faces, like the relay's Walk", () => {
    const g = goalFrom({ x: 1, y: 1, yaw: Math.PI / 2 }, 2, 0, 0);
    expect(g.x).toBeCloseTo(1);
    expect(g.y).toBeCloseTo(3);
    expect(goalFrom({ x: 0, y: 0, yaw: 3 }, 0, 0, 1).yaw).toBeCloseTo(wrap(4));
  });
});

describe("walkLine", () => {
  it("says nothing before any walk, and the reason after a failure", () => {
    expect(walkLine({ state: "idle" })).toBeNull();
    expect(walkLine({ state: "failure", reason: "odometry stopped" })).toEqual({
      tone: "error", text: "The walk failed: odometry stopped",
    });
    expect(walkLine({ state: "success", error: { pos_m: 0.04, yaw_deg: -2 } })?.text).toBe(
      "Arrived · 4 cm and 2° off",
    );
  });
});

describe("parseLidarMessage", () => {
  it("reads the obstacle map and keeps only well-formed squares", () => {
    const m = parseLidarMessage(
      '{"t":1,"age_ms":40,"pts_s":200000,"floor":-1.19,"tilt_deg":30,"odom":1,"res":0.1,"cells":[[1,2],[3],"x",[4,5]]}',
    );
    expect(m?.kind).toBe("frame");
    if (m?.kind === "frame") {
      expect(m.frame.cells).toEqual([[1, 2], [4, 5]]);
      expect(m.frame.odom).toBe(true);
    }
  });
  it("is stale before the lidar ever sent", () => {
    expect(parseLidarMessage('{"t":1,"age_ms":-1}')).toEqual({ kind: "stale" });
  });
  it("says when a walk waits for its way to clear", () => {
    expect(walkLine({ state: "running", blocked: { dist_m: 0.42 } })).toEqual({
      tone: "warn", text: "Something 0.42 m ahead: waiting for the way to clear",
    });
  });
});

describe("relativeTo", () => {
  it("undoes goalFrom: a point marked on the map becomes a request from where the robot is", () => {
    const p = { x: 1, y: -2, yaw: 2.5 };
    const g = goalFrom(p, 0.7, -1.8, 0.4);
    const r = relativeTo(p, g);
    expect(r.dx).toBeCloseTo(0.7);
    expect(r.dy).toBeCloseTo(-1.8);
    expect(r.dyaw).toBeCloseTo(0.4);
  });
});
