import { describe, expect, it } from "vitest";
import { choiceGroups } from "./choiceGroups";

describe("choiceGroups", () => {
  it("keeps the flat grid when the catalog sends no groups", () => {
    expect(choiceGroups(["a", "b"])).toEqual([{ title: null, values: ["a", "b"] }]);
  });

  it("splits values by group, in the catalog's order", () => {
    const g = choiceGroups(["hug", "high_wave", "clap"], {
      "Run mode": ["hug", "clap"],
      "Walk or Run": ["high_wave"],
    });
    expect(g).toEqual([
      { title: "Run mode", values: ["hug", "clap"] },
      { title: "Walk or Run", values: ["high_wave"] },
    ]);
  });

  it("never drops a value the groups forgot", () => {
    const g = choiceGroups(["hug", "new_one"], { "Run mode": ["hug"] });
    expect(g.at(-1)).toEqual({ title: null, values: ["new_one"] });
  });
});
