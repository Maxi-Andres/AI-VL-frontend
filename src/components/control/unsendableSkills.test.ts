import { describe, expect, it } from "vitest";
import type { SkillInfo } from "../../api/backend";
import { choiceSendable, unsendableSkills } from "./unsendableSkills";

const cat = (...names: string[]): Record<string, SkillInfo> =>
  Object.fromEntries(names.map((n) => [n, { desc: n, params: {} }]));

const go2 = cat("stand_up", "hello", "stretch", "front_flip", "dance1");

describe("unsendableSkills", () => {
  it("marks what the relay does not let through", () => {
    const t = { go2: { mode: "relay", url: "u", allowed_skills: ["stand_up", "hello", "stop"] } };
    expect([...unsendableSkills(go2, t, "go2")].sort()).toEqual(["dance1", "front_flip", "stretch"]);
  });

  it("reads the SELECTED robot's list, not another robot's", () => {
    const t = {
      go2: { mode: "relay", url: "u", allowed_skills: ["hello"] },
      g1: { mode: "relay", url: "u", allowed_skills: ["wave_hand"] },
    };
    expect([...unsendableSkills(cat("wave_hand", "hello"), t, "g1")]).toEqual(["hello"]);
  });

  it("marks nothing for a DDS robot", () => {
    expect(unsendableSkills(go2, { go2: { mode: "dds", url: "" } }, "go2").size).toBe(0);
  });

  it("marks nothing while the transports are unknown", () => {
    expect(unsendableSkills(go2, null, "go2").size).toBe(0);
  });
});

describe("choiceSendable", () => {
  const t = {
    g1: { mode: "relay", url: "u", allowed_values: { arm_action: { action: ["hug"] } } },
  };

  it("lets through only the listed values of a choice skill", () => {
    const ok = choiceSendable(t, "g1");
    expect(ok("arm_action", "hug")).toBe(true);
    expect(ok("arm_action", "high_five")).toBe(false);
  });

  it("does not restrict a skill the relay sent no list for", () => {
    expect(choiceSendable(t, "g1")("set_gait", "classic")).toBe(true);
  });

  it("restricts nothing while the transports are unknown", () => {
    expect(choiceSendable(null, "g1")("arm_action", "high_five")).toBe(true);
  });
});
