import { describe, expect, it } from "vitest";
import {
  DEFAULT_LIMITS,
  controlMessage,
  describeEvent,
  STALL_SHOW_MS,
  fingerPos,
  isFinger,
  isNewEvent,
  liveStalls,
  noteStall,
  stallJoint,
  targetRange,
} from "./jointControl";

describe("targetRange", () => {
  // The same rule g1_joint_sender applies (robot-command-relay/src/joint_ctl_core.hpp, rule 4).
  const elbow = { lower: -1.0472, upper: 2.0944 };

  it("is the full URDF range minus the margin by default", () => {
    expect(DEFAULT_LIMITS).toEqual({ excursion: 0, margin: 0.05 });
    const r = targetRange(0.9, elbow);
    expect(r.lower).toBeCloseTo(-0.9972);
    expect(r.upper).toBeCloseTo(2.0444);
  });

  it("narrows to the excursion around the start when the robot sets one", () => {
    const r = targetRange(0.9, elbow, { excursion: 0.6, margin: 0.05 });
    expect(r.lower).toBeCloseTo(0.3);
    expect(r.upper).toBeCloseTo(1.5);
    const end = targetRange(1.9, elbow, { excursion: 0.6, margin: 0.05 });
    expect(end.upper).toBeCloseTo(2.0444);
  });
});

describe("describeEvent", () => {
  it("explains why the robot took the arm back", () => {
    expect(describeEvent("releasing requested")).toBeNull();
    expect(describeEvent("released requested")).toBe("Released.");
    expect(describeEvent("released deadman")).toMatch(/^Released: nothing arrived/);
    expect(describeEvent("releasing fsm_1")).toBe("Releasing: the robot left Walk (mode 1).");
    expect(describeEvent("state active")).toBeNull();
    expect(describeEvent("stall left_shoulder_pitch")).toBe(
      "Left shoulder pitch pushed against something: it stopped where it was.",
    );
  });
});

describe("controlMessage", () => {
  it("sends arm joints as targets in radians", () => {
    expect(controlMessage("left_elbow_joint", 0.5)).toEqual({
      op: "target", joint: "left_elbow", q: 0.5,
    });
    expect(isFinger("left_elbow_joint")).toBe(false);
  });

  it("sends fingers in the hand's own units and order", () => {
    // index is the hand's finger 2; its URDF joint closes over 1.4661 rad.
    expect(isFinger("right_index_proximal_joint")).toBe(true);
    expect(controlMessage("right_index_proximal_joint", 1.4661 / 2)).toEqual({
      op: "hand", side: "right", finger: 2, pos: 500,
    });
    // thumb flex is finger 0, thumb rotation finger 1 — the pair that is easy to swap.
    expect(controlMessage("left_thumb_proximal_joint", 1.0472)).toMatchObject({
      finger: 0, pos: 1000,
    });
    expect(controlMessage("left_thumb_metacarpal_joint", 0)).toMatchObject({ finger: 1, pos: 0 });
    expect(fingerPos("left_pinky_proximal_joint", 9)).toBe(1000);
  });
});

describe("stall alerts (the viewer's top-left list)", () => {
  it("names the joint of a stall event, and nothing else", () => {
    expect(stallJoint("stall left_elbow")).toBe("left_elbow_joint");
    expect(stallJoint("releasing deadman")).toBeNull();
    expect(stallJoint(null)).toBeNull();
  });

  it("counts a second stall of the same joint, which repeats the same text", () => {
    // Every reply repeats the LAST event: only the relay's count tells them apart.
    const seen = { seq: 2, event: "stall left_elbow" };
    expect(isNewEvent(seen, "stall left_elbow", 2)).toBe(false);   // a keepalive's echo
    expect(isNewEvent(seen, "stall left_elbow", 3)).toBe(true);    // the arm stalled again
  });

  it("falls back to a change of text with a relay that does not count", () => {
    expect(isNewEvent({ seq: 0, event: "state active" }, "stall left_elbow", undefined)).toBe(true);
    expect(isNewEvent({ seq: 0, event: "stall left_elbow" }, "stall left_elbow", undefined)).toBe(false);
    expect(isNewEvent({ seq: 0, event: null }, null, 4)).toBe(false);
  });

  it("puts the latest stall first, adds up repeats, and forgets them after a while", () => {
    let a = noteStall([], "left_elbow_joint", 1000);
    a = noteStall(a, "right_elbow_joint", 2000);
    a = noteStall(a, "left_elbow_joint", 3000);
    expect(a.map((s) => [s.urdf, s.count, s.at])).toEqual([
      ["left_elbow_joint", 2, 3000],
      ["right_elbow_joint", 1, 2000],
    ]);
    expect(liveStalls(a, 2000 + STALL_SHOW_MS - 1)).toHaveLength(2);
    expect(liveStalls(a, 2000 + STALL_SHOW_MS).map((s) => s.urdf)).toEqual(["left_elbow_joint"]);
  });
});
