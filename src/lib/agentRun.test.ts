import { describe, expect, it } from "vitest";
import { agentChat, type AgentAction, type AgentTurn } from "./agentTrace";
import { attachPage, beginRun, endRun, liveRun, newTurnId, record } from "./agentRun";

describe("a run outlives the page that started it", () => {
  it("goes on with no page open, and says nobody took its end", () => {
    // Catches (2026-11-13): leaving Agent for Navigation stopped the walk and lost the turn.
    const id = newTurnId();
    beginRun(id, "caminá dos metros", "chat-1", 1);
    record({ type: "event", id, event: { type: "tool", tool: "navigate", args: {} }, at: 2 });
    record({ type: "event", id, event: { type: "reply", text: "Listo." }, at: 3 });
    const { turn, taken } = endRun({ type: "end", id, at: 4 });
    expect(taken).toBe(false);                         // the caller saves it
    expect(turn?.instruction).toBe("caminá dos metros");
    expect(turn?.reply).toBe("Listo.");
    expect(turn?.running).toBe(false);
    expect(liveRun()).toBeNull();
  });

  it("a page opened mid-run catches up from the first event, then follows it", () => {
    const id = newTurnId();
    beginRun(id, "girá a la izquierda", null, 1);
    record({ type: "event", id, event: { type: "understood", text: "girar" }, at: 2 });
    // The page opens: it replays what was kept, then takes the rest live.
    let turns: AgentTurn[] = [];
    for (const a of liveRun()?.actions ?? []) turns = agentChat(turns, a);
    const seen: AgentAction[] = [];
    const leave = attachPage((a) => {
      seen.push(a);
      turns = agentChat(turns, a);
    });
    record({ type: "event", id, event: { type: "reply", text: "Giré." }, at: 3 });
    const { taken } = endRun({ type: "end", id, at: 4 });
    leave();
    expect(taken).toBe(true);                          // the page saves it
    expect(seen.map((a) => a.type)).toEqual(["event", "end"]);
    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({ understood: "girar", reply: "Giré.", running: false });
  });

  it("STOP is kept with the run, and another run's actions are not", () => {
    const id = newTurnId();
    beginRun(id, "andá a la silla", null, 1);
    record({ type: "stopping", id });
    record({ type: "event", id: id + 1000, event: { type: "reply", text: "otro" }, at: 2 });
    const { turn } = endRun({ type: "end", id, at: 3 });
    expect(turn?.stopping).toBe(true);
    expect(turn?.reply).toBeUndefined();
  });

  it("a page that left takes nothing more", () => {
    const id = newTurnId();
    beginRun(id, "aplaudí", null, 1);
    const seen: AgentAction[] = [];
    attachPage((a) => seen.push(a))();               // attached and left at once
    record({ type: "event", id, event: { type: "reply", text: "Listo." }, at: 2 });
    expect(endRun({ type: "end", id, at: 3 }).taken).toBe(false);
    expect(seen).toEqual([]);
  });

  it("turn ids never repeat, across pages", () => {
    const a = newTurnId();
    const b = newTurnId();
    expect(b).toBeGreaterThan(a);
  });
});
