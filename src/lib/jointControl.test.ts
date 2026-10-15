import { describe, expect, it } from "vitest";
import { DEFAULT_LIMITS, describeEvent, targetRange } from "./jointControl";

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
