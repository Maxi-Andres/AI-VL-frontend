import { describe, expect, it } from "vitest";
import { whepUrlFor } from "./robotStreams";

const BASE = "https://192.168.20.99:8889/robot/whep";

describe("whepUrlFor", () => {
  it("keeps the Go2 on its historical path", () => {
    expect(whepUrlFor(BASE, "go2")).toBe(BASE);
  });
  it("sends the G1 to its own path", () => {
    expect(whepUrlFor(BASE, "g1")).toBe("https://192.168.20.99:8889/g1/whep");
  });
  it("leaves an unknown robot on the configured URL", () => {
    expect(whepUrlFor(BASE, "b2")).toBe(BASE);
  });
  it("leaves a URL that is not /<path>/whep untouched", () => {
    expect(whepUrlFor("https://h/custom", "g1")).toBe("https://h/custom");
  });
});
