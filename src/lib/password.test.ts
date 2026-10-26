import { describe, expect, it } from "vitest";
import { initials, passwordStrength } from "./password";

describe("passwordStrength", () => {
  it("refuses what the backend refuses", () => {
    expect(passwordStrength("short").score).toBe(0);
    expect(passwordStrength("annabelleann", "annabelleann@acme.com").score).toBe(0);
  });
  it("rewards length first", () => {
    expect(passwordStrength("aaaaaaaaaaaa").score).toBe(1);
    expect(passwordStrength("aaaaaaaaaaaaaaaa").score).toBe(2);
    expect(passwordStrength("correct horse battery staple").score).toBe(3);
    expect(passwordStrength("Correct horse battery 9").score).toBe(4);
  });
});

describe("initials", () => {
  it("takes first and last word", () => expect(initials("Ana María Pérez")).toBe("AP"));
  it("uses the email's local part", () => {
    expect(initials("ana@acme.com")).toBe("AN");
    expect(initials("ana.perez@acme.com")).toBe("AP");
  });
  it("single word", () => expect(initials("Maximiliano")).toBe("MA"));
});
