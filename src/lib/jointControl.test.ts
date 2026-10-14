import { describe, expect, it } from "vitest";
import { EXCURSION_RAD, MARGIN_RAD, describeEvent, targetRange } from "./jointControl";

describe("targetRange", () => {
  // The same rule g1_joint_sender applies (robot-command-relay/src/joint_ctl_core.hpp, rule 4):
  // the URDF range minus a margin, and no further than EXCURSION_RAD from the start.
  const elbow = { lower: -1.0472, upper: 2.0944 };

  it("matches the robot's defaults", () => {
    expect(EXCURSION_RAD).toBe(0.6);
    expect(MARGIN_RAD).toBe(0.05);
  });

  it("is the excursion around the start, mid-range", () => {
    const r = targetRange(0.9, elbow);
    expect(r.lower).toBeCloseTo(0.3);
    expect(r.upper).toBeCloseTo(1.5);
  });

  it("stops short of the URDF limit near the end of the range", () => {
    const r = targetRange(1.9, elbow);
    expect(r.upper).toBeCloseTo(2.0444);
    expect(r.lower).toBeCloseTo(1.3);
  });
});

describe("describeEvent", () => {
  it("explains why the robot took the arm back", () => {
    expect(describeEvent("releasing requested")).toBeNull();
    expect(describeEvent("released requested")).toBe("Released.");
    expect(describeEvent("released deadman")).toMatch(/^Released: nothing arrived/);
    expect(describeEvent("releasing fsm_1")).toBe("Releasing: the robot left Walk (mode 1).");
    expect(describeEvent("state active")).toBeNull();
  });
});
