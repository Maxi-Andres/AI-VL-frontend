import { describe, expect, it } from "vitest";
import { EAR_OFF, earEvent, earStatus, ROBOTS_WITH_MIC, type EarView } from "./robotEar";

const listening: EarView = { state: "listening", heard: "", error: null };

describe("earEvent", () => {
  it("answers only the 'command' events, with just the request", () => {
    // Catches: every phrase the robot overhears being sent to the VLM — only "Bender, …" is.
    expect(earEvent(listening, { type: "heard", text: "hola che" }).action).toBeNull();
    expect(earEvent(listening, { type: "command", text: "qué ves" }).action).toEqual({
      kind: "command",
      text: "qué ves",
    });
    expect(earEvent(listening, { type: "command", text: "" }).action).toBeNull();
  });

  it("a bare 'Bender' asks for the acknowledgement", () => {
    expect(earEvent(listening, { type: "wake" }).action).toEqual({ kind: "wake" });
  });

  it("an error turns it off with the reason, and junk changes nothing", () => {
    const { view } = earEvent(listening, { type: "error", error: "no microphone (G1 only)" });
    expect(view).toMatchObject({ state: "error", error: "no microphone (G1 only)" });
    expect(earEvent(listening, "not an object")).toEqual({ view: listening, action: null });
    expect(earEvent(listening, { type: "mystery" })).toEqual({ view: listening, action: null });
  });

  it("keeps what was heard for the panel", () => {
    let v = earEvent(EAR_OFF, { type: "listening" }).view;
    v = earEvent(v, { type: "speech" }).view;
    expect(earStatus(v)).toContain("hearing");
    v = earEvent(v, { type: "heard", text: "Bender, qué ves" }).view;
    expect(earStatus(v)).toContain("Bender, qué ves");
  });
});

describe("cutting the robot off", () => {
  it("is a barge, with the new request or none", () => {
    const v = earEvent(EAR_OFF, { type: "listening" }).view;
    expect(earEvent(v, { type: "barge", text: "" }).action).toEqual({ kind: "barge", text: "" });
    expect(earEvent(v, { type: "barge", text: "qué hora es" }).action).toEqual({ kind: "barge", text: "qué hora es" });
  });
});

describe("robots with a mic", () => {
  it("is the G1 only: the Go2's mic is reachable over WebRTC alone", () => {
    expect(ROBOTS_WITH_MIC.has("g1")).toBe(true);
    expect(ROBOTS_WITH_MIC.has("go2")).toBe(false);
  });
});
