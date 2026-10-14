import { describe, expect, it } from "vitest";
import {
  BODY_JOINTS,
  JOINTS,
  LOCKED_JOINTS,
  legPairs,
  parseStreamMessage,
  readJoint,
  tempLevel,
  type JointFrame,
} from "./g1Joints";
// The very file the page loads, read as text by Vite: the test checks the real model.
import urdf from "../../public/g1/g1.urdf?raw";

/** name -> type for every joint in the model the page draws. */
const urdfJoints = new Map(
  [...urdf.matchAll(/<joint name="([^"]+)" type="([^"]+)"/g)].map((m) => [m[1], m[2]]),
);
/** Joints that only follow another one (the Inspire fingers' outer segments): no motor. */
const mimicJoints = new Set(
  [...urdf.matchAll(/<joint name="([^"]+)"[^>]*>((?:(?!<\/joint>)[\s\S])*)<\/joint>/g)]
    .filter((m) => m[2].includes("<mimic"))
    .map((m) => m[1]),
);

const line = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    t: 1791900000.5,
    age_ms: 2,
    mode_machine: 6,
    imu: [0.01, -0.05, 1.2],
    q: BODY_JOINTS.map((_, i) => i / 100),
    tau: BODY_JOINTS.map(() => 0.5),
    temp: BODY_JOINTS.map(() => 40),
    left: { age_ms: 3, q: [0, -0.1, -0.2, -0.3, -0.4, -0.5], tau: [0, 0, 0, 0, 0, 0],
            temp: [30, 30, 30, 30, 30, 30] },
    right: null,
    ...over,
  });

function frameOf(text: string): JointFrame {
  const m = parseStreamMessage(text);
  if (m?.kind !== "frame") throw new Error(`not a frame: ${text}`);
  return m.frame;
}

describe("the joint table against the model", () => {
  it("names every joint the model has, and only those", () => {
    // Catches: the model swapped for another variant, or a typo in a name — either of which
    // leaves a joint that silently never moves.
    for (const j of JOINTS) expect(urdfJoints.has(j.urdf), j.urdf).toBe(true);
    const revolute = [...urdfJoints]
      .filter(([n, t]) => t === "revolute" && !mimicJoints.has(n))
      .map(([n]) => n);
    expect(new Set(revolute)).toEqual(
      new Set(JOINTS.map((j) => j.urdf).filter((n) => !LOCKED_JOINTS.has(n.replace(/_joint$/, "")))),
    );
  });

  it("matches the robot's lock-waist variant: waist roll and pitch are fixed", () => {
    expect(urdfJoints.get("waist_roll_joint")).toBe("fixed");
    expect(urdfJoints.get("waist_pitch_joint")).toBe("fixed");
    expect(urdfJoints.get("waist_yaw_joint")).toBe("revolute");
  });

  it("draws Inspire five-finger hands, not Dex3", () => {
    // The robot's hands, seen 2026-10-14. Every finger's outer joint follows its inner one.
    expect(mimicJoints.size).toBe(12);
    expect(urdfJoints.has("L_pinky_proximal_joint")).toBe(true);
    expect(urdfJoints.has("left_hand_thumb_0_joint")).toBe(false);
  });

  it("has 29 body joints and 6 per hand, each id unique", () => {
    expect(JOINTS.filter((j) => j.source === "body")).toHaveLength(29);
    expect(JOINTS.filter((j) => j.source === "left")).toHaveLength(6);
    expect(new Set(JOINTS.map((j) => j.urdf)).size).toBe(JOINTS.length);
  });
});

describe("parseStreamMessage", () => {
  it("reads a full line", () => {
    const f = frameOf(line());
    expect(f.modeMachine).toBe(6);
    expect(f.imu).toEqual([0.01, -0.05, 1.2]);
    expect(f.q?.[3]).toBe(0.03);
    expect(f.left?.q[5]).toBe(-0.5);
    expect(f.right).toBeNull();
  });

  it("reads the line the bridge prints before the robot has said anything", () => {
    const f = frameOf('{"t":1791900000.1,"age_ms":-1,"left":null,"right":null}');
    expect(f.ageMs).toBe(-1);
    expect(f.q).toBeNull();
  });

  it("tells stale heartbeats and final errors apart from frames", () => {
    expect(parseStreamMessage('{"stale":true}')).toEqual({ kind: "stale" });
    expect(parseStreamMessage('{"error":"relay unreachable","final":true}')).toEqual({
      kind: "error", error: "relay unreachable", final: true,
    });
  });

  it("drops malformed input instead of half-applying it", () => {
    expect(parseStreamMessage("not json")).toBeNull();
    expect(parseStreamMessage("[1,2]")).toBeNull();
    // A body array of the wrong length must not reach the model at all.
    expect(frameOf(line({ q: [1, 2, 3] })).q).toBeNull();
    // NaN does not survive JSON, but a string in the array must not either.
    expect(frameOf(line({ q: BODY_JOINTS.map(() => "x") })).q).toBeNull();
    expect(frameOf(line({ left: { q: [1, 2] } })).left).toBeNull();
  });
});

describe("readJoint", () => {
  it("reads body and hand joints by their own index", () => {
    const f = frameOf(line());
    const elbow = JOINTS.find((j) => j.urdf === "left_elbow_joint")!;
    expect(readJoint(f, elbow)).toEqual({ q: 0.18, tau: 0.5, temp: 40 });
    const index = JOINTS.find((j) => j.urdf === "L_index_proximal_joint")!;
    expect(readJoint(f, index)?.q).toBe(-0.2);
    const rightThumb = JOINTS.find((j) => j.urdf === "R_thumb_proximal_yaw_joint")!;
    expect(readJoint(f, rightThumb)).toBeNull();
  });
});

describe("tempLevel", () => {
  it("steps up to the telemetry's 80 °C alarm", () => {
    expect(tempLevel(null)).toBe("normal");
    expect(tempLevel(54)).toBe("normal");
    expect(tempLevel(60)).toBe("warm");
    expect(tempLevel(75)).toBe("hot");
    expect(tempLevel(80)).toBe("critical");
  });
});

describe("legPairs", () => {
  it("mirrors roll and yaw, not pitch", () => {
    const q = BODY_JOINTS.map(() => 0);
    q[BODY_JOINTS.indexOf("left_hip_pitch")] = 0.1;
    q[BODY_JOINTS.indexOf("right_hip_pitch")] = 0.1;
    q[BODY_JOINTS.indexOf("left_ankle_roll")] = 0.05;
    q[BODY_JOINTS.indexOf("right_ankle_roll")] = -0.05;
    const pairs = legPairs(frameOf(line({ q })));
    expect(pairs.find((p) => p.joint === "hip pitch")!.diff).toBeCloseTo(0);
    expect(pairs.find((p) => p.joint === "ankle roll")!.diff).toBeCloseTo(0);
  });

  it("shows the right-ankle offset seen on 2026-10-13", () => {
    // Standing, from the telemetry: left ankle roll -0.0495 rad, right -0.1163 rad.
    const q = BODY_JOINTS.map(() => 0);
    q[BODY_JOINTS.indexOf("left_ankle_roll")] = -0.0495;
    q[BODY_JOINTS.indexOf("right_ankle_roll")] = -0.1163;
    const roll = legPairs(frameOf(line({ q }))).find((p) => p.joint === "ankle roll")!;
    expect(Math.abs(roll.diff)).toBeGreaterThan(9);
  });
});
