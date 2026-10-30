import { describe, expect, it } from "vitest";
import {
  BODY_JOINTS,
  HAND_JOINTS,
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
    // The left hand as read off the robot on 2026-10-15, at rest.
    left: { age_ms: 3, pos: [399, 400, 50, 50, 49, 50], speed: [0, 0, 0, 0, 0, 0],
            current: [13, 14, -12, -23, 27, -31], state: [0, 0, 0, 0, 0, 0], errors: 0 },
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

  it("draws BrainCo hands, not Dex3 or Inspire", () => {
    // The robot's hands, identified 2026-10-15. Every finger's outer joint follows its inner one.
    expect(mimicJoints.size).toBe(10);
    expect(urdfJoints.get("left_thumb_metacarpal_joint")).toBe("revolute");
    expect(urdfJoints.has("L_pinky_proximal_joint")).toBe(false);
    expect(urdfJoints.has("left_hand_thumb_0_joint")).toBe(false);
    // The fingertip joints are pinned (lower == upper) in Unitree's file: built as fixed.
    expect(urdfJoints.get("left_index_tip_joint")).toBe("fixed");
  });

  it("uses each hand joint's real upper limit", () => {
    for (const h of HAND_JOINTS) {
      const m = new RegExp(`<joint name="left_${h.urdf}_joint"[\\s\\S]*?upper="([^"]+)"`).exec(urdf);
      expect(Number(m?.[1]), h.urdf).toBeCloseTo(h.upper, 3);
    }
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
    expect(f.left?.pos[0]).toBe(399);
    expect(f.left?.q[2]).toBeCloseTo(0.05 * 1.4661);
    expect(f.right).toBeNull();
  });

  it("reads each fingertip's touch, a void finger as null, and no touch as null", () => {
    const hand = { age_ms: 3, pos: [399, 400, 50, 50, 49, 50], speed: [0, 0, 0, 0, 0, 0],
                   current: [0, 0, 0, 0, 0, 0], state: [0, 0, 0, 0, 0, 0], errors: 0 };
    const f = frameOf(line({ left: { ...hand, touch: [3.65, null, 0, 0.4, 5.72] } }));
    expect(f.left?.touch).toEqual([3.65, null, 0, 0.4, 5.72]);
    const thumbRotation = JOINTS.find((j) => j.source === "left" && j.urdf.includes("thumb_metacarpal"));
    const index = JOINTS.find((j) => j.source === "left" && j.urdf.includes("index_proximal"));
    expect(readJoint(f, thumbRotation!)?.finger?.touch).toBe(3.65);
    expect(readJoint(f, index!)?.finger?.touch).toBeNull();
    expect(frameOf(line()).left?.touch).toBeNull();
    expect(frameOf(line({ left: { ...hand, touch: [1, 2] } })).left?.touch).toBeNull();
    expect(readJoint(frameOf(line()), index!)?.finger?.touch).toBeUndefined();
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
    expect(frameOf(line({ left: { pos: [1, 2] } })).left).toBeNull();
  });
});

describe("readJoint", () => {
  it("reads body and hand joints by their own index", () => {
    const f = frameOf(line());
    const elbow = JOINTS.find((j) => j.urdf === "left_elbow_joint")!;
    expect(readJoint(f, elbow)).toEqual({ q: 0.18, tau: 0.5, temp: 40 });
    const index = JOINTS.find((j) => j.urdf === "left_index_proximal_joint")!;
    expect(readJoint(f, index)?.finger).toEqual({ pos: 50, current: -12, state: 0 });
    const thumbFlex = JOINTS.find((j) => j.urdf === "left_thumb_proximal_joint")!;
    expect(readJoint(f, thumbFlex)?.q).toBeCloseTo(0.399 * 1.0472);
    const rightThumb = JOINTS.find((j) => j.urdf === "right_thumb_proximal_joint")!;
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
