import { describe, expect, it } from "vitest";
import { EAR_OFF, earEvent, earStatus, ROBOTS_WITH_MIC, spokenRequest, type EarView } from "./robotEar";

const listening: EarView = { state: "listening", heard: "", error: null, mode: null };

describe("earEvent", () => {
  it("answers only the 'command' events, with just the request", () => {
    // Catches: every phrase the robot overhears being sent to the VLM — only "Bender, …" is.
    expect(earEvent(listening, { type: "heard", text: "hola che" }).action).toBeNull();
    expect(earEvent(listening, { type: "command", text: "qué ves" }).action).toEqual({
      kind: "command",
      text: "qué ves",
      to: "page", // an older gateway said nothing: the page answered, as it did
    });
    expect(earEvent(listening, { type: "command", text: "" }).action).toBeNull();
  });

  it("a bare 'Bender' asks for the acknowledgement", () => {
    expect(earEvent(listening, { type: "wake" }).action).toEqual({ kind: "wake", to: "page" });
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

describe("who answers it (the gateway's mode)", () => {
  it("is the page in the vlm mode and the agent in the agent mode", () => {
    // Catches: the page answering with the VLM what the agent is already doing (or moving for).
    expect(earEvent(listening, { type: "command", text: "date la vuelta", to: "agent" }).action)
      .toEqual({ kind: "command", text: "date la vuelta", to: "agent" });
    expect(earEvent(listening, { type: "command", text: "qué ves", to: "page" }).action)
      .toEqual({ kind: "command", text: "qué ves", to: "page" });
  });

  it("keeps the mode the gateway says it is in, and ignores a mode it does not know", () => {
    expect(earEvent(listening, { type: "mode", mode: "agent" }).view.mode).toBe("agent");
    expect(earEvent(listening, { type: "mode", mode: "dance" }).view.mode).toBeNull();
  });
});

describe("the agent's answer to what the robot heard", () => {
  it("says which run each event belongs to", () => {
    // Catches: the "end" of a run taken over closing the turn of the run that took over.
    expect(earEvent(listening, { type: "agent", run: 7, event: { type: "end" } }).action)
      .toEqual({ kind: "agent", event: { type: "end", run: 7 } });
    expect(earEvent(listening, { type: "agent", run: "7", event: { type: "end", run: 3 } }).action)
      .toEqual({ kind: "agent", event: { type: "end" } });
  });

  it("comes as agent events, and junk inside them changes nothing", () => {
    expect(earEvent(listening, { type: "agent", event: { type: "reply", text: "Listo." } }).action)
      .toEqual({ kind: "agent", event: { type: "reply", text: "Listo." } });
    expect(earEvent(listening, { type: "agent", event: { type: "tool", tool: "navigate" } }).action)
      .toEqual({ kind: "agent", event: { type: "tool", tool: "navigate" } });
    expect(earEvent(listening, { type: "agent", event: { type: "reply", text: 3 } }).action)
      .toEqual({ kind: "agent", event: { type: "reply" } });
    expect(earEvent(listening, { type: "agent", event: "nope" }).action).toBeNull();
    expect(earEvent(listening, { type: "agent" }).action).toBeNull();
  });
});

describe("cutting the robot off", () => {
  it("is a barge, with the new request or none", () => {
    const v = earEvent(EAR_OFF, { type: "listening" }).view;
    expect(earEvent(v, { type: "barge", text: "" }).action).toEqual({ kind: "barge", text: "", to: "page" });
    expect(earEvent(v, { type: "barge", text: "qué hora es", to: "agent" }).action)
      .toEqual({ kind: "barge", text: "qué hora es", to: "agent" });
  });
});

describe("spokenRequest", () => {
  it("drops the names a phrase opens with", () => {
    expect(spokenRequest("Bender, ¿qué ves?")).toBe("¿qué ves?");
    expect(spokenRequest("Huesos huesos ¿qué hora es?")).toBe("¿qué hora es?");
  });
  it("is empty when only names were said", () => {
    expect(spokenRequest("Bender Bender Bender")).toBe("");
    expect(spokenRequest("¡Bénder!")).toBe("");
  });
  it("keeps a name inside the question", () => {
    expect(spokenRequest("¿Quién es Bender?")).toBe("¿Quién es Bender?");
  });
});

describe("robots with a mic", () => {
  it("is the G1 only: the Go2's mic is reachable over WebRTC alone", () => {
    expect(ROBOTS_WITH_MIC.has("g1")).toBe(true);
    expect(ROBOTS_WITH_MIC.has("go2")).toBe(false);
  });
});
