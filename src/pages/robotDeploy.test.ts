import { describe, expect, it } from "vitest";
import { DEPLOY, deployFor } from "./robotDeploy";

// The failure these guard against is a copy-paste one: the G1's section built by duplicating
// the Go2's and forgetting to change a name, which would send someone to build or restart
// the wrong robot's binary on the wrong computer.

const allLines = (m: "go2" | "g1") => [
  ...DEPLOY[m].ssh,
  ...DEPLOY[m].services.flatMap((s) => [s.specific, ...s.update]),
  ...DEPLOY[m].firstTime.flatMap((s) => s.lines),
];

describe("robot deploy tables", () => {
  it("never names a Go2-only file in a G1 command", () => {
    expect(allLines("g1").filter((l) => /\bgo2_/.test(l))).toEqual([]);
  });

  it("never names a G1-only file in a Go2 command", () => {
    expect(allLines("go2").filter((l) => /\bg1_|host\/g1\/|\.g1\.service/.test(l))).toEqual([]);
  });

  it("never points the G1 at the Go2's addresses", () => {
    expect(allLines("g1").filter((l) => /192\.168\.123\.18\b|10\.1\.254\.18\b/.test(l))).toEqual([]);
  });

  it("gives every running repo service a way to update it", () => {
    for (const m of ["go2", "g1"] as const) {
      for (const s of DEPLOY[m].services) {
        if (s.state === "running" && s.repo.startsWith("~/robot-")) {
          expect(s.update.length, `${m} ${s.unit}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("installs the G1 telemetry unit under the shared service name", () => {
    const lines = DEPLOY.g1.firstTime.flatMap((s) => s.lines).join("\n");
    expect(lines).toContain("robot-telemetry-agent.g1.service");
    expect(lines).toContain("/etc/systemd/system/robot-telemetry-agent.service");
  });

  it("falls back to the Go2 for an unknown robot id", () => {
    expect(deployFor("g1")).toBe(DEPLOY.g1);
    expect(deployFor("something-else")).toBe(DEPLOY.go2);
  });
});
