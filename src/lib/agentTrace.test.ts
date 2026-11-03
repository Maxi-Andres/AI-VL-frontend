// The /agent chat built from the stream's events: steps attach to their tool, results close it,
// the reply ends the run, and a stream that ends without one still leaves a finished turn.
import { describe, expect, it } from "vitest";
import { agentChat, runningTool, type AgentAction, type AgentTurn, type ToolItem } from "./agentTrace";
import type { AgentEvent } from "../types";

const ev = (event: AgentEvent, at = 0): AgentAction => ({ type: "event", id: 1, event, at });

function play(actions: AgentAction[], from: AgentTurn[] = []): AgentTurn[] {
  return actions.reduce(agentChat, from);
}

const start: AgentAction = { type: "start", id: 1, text: "agarrá la botella ", at: 0 };

describe("agentChat", () => {
  it("keeps understood and plan, and hides a heard that only trimmed the instruction", () => {
    const [turn] = play([
      start, ev({ type: "heard", text: "agarrá la botella" }),
      ev({ type: "understood", text: "botella → mano" }),
      ev({ type: "plan", steps: ["locate", "approach", "grasp"] }),
    ]);
    expect(turn.heard).toBeUndefined();
    expect(turn.understood).toBe("botella → mano");
    expect(turn.plan).toEqual(["locate", "approach", "grasp"]);
    expect(turn.running).toBe(true);
  });

  it("attaches each tool event to its own tool and closes it with its result", () => {
    const [turn] = play([
      start,
      ev({ type: "tool", tool: "look", args: { question: "where?" } }, 1000),
      ev({ type: "tool_result", tool: "look", result: { ok: true, answer: "on the table" } }, 3000),
      ev({ type: "tool", tool: "pick", args: { object: "bottle" } }, 4000),
      ev({ type: "tool_event", tool: "pick", step: "raising the arm", detail: "" }, 6000),
      ev({ type: "tool_event", tool: "pick", step: "closing", detail: "hand" }, 9000),
    ]);
    const [look, pick] = turn.items as ToolItem[];
    expect(look).toMatchObject({ tool: "look", steps: [], startedAt: 1000, endedAt: 3000, result: { ok: true } });
    expect(pick.steps.map((s) => s.step)).toEqual(["raising the arm", "closing"]);
    expect(pick.endedAt).toBeUndefined();
    expect(runningTool(turn)).toBe(pick);

    const [done] = play([ev({ type: "tool_result", tool: "pick", result: { ok: false, state: "failed", error: "slipped" } }, 70000)], [turn]);
    expect(done.items[1]).toMatchObject({ endedAt: 70000, result: { ok: false, error: "slipped" } });
    expect(runningTool(done)).toBeNull();
  });

  it("shows a tool event that arrives with no tool line by making one", () => {
    const [turn] = play([start, ev({ type: "tool_event", tool: "pick", step: "closing", detail: "" }, 5)]);
    expect(turn.items).toEqual([{ kind: "tool", tool: "pick", args: {}, steps: [{ step: "closing", detail: "", at: 5 }], startedAt: 5 }]);
  });

  it("ends the run at the reply, closing any tool still open", () => {
    const [turn] = play([
      start, ev({ type: "tool", tool: "pick", args: {} }, 10),
      { type: "stopping", id: 1 },
      ev({ type: "reply", text: "Me detuve." }, 50),
    ]);
    expect(turn).toMatchObject({ reply: "Me detuve.", running: false, stopping: true });
    expect((turn.items[0] as ToolItem).endedAt).toBe(50);
  });

  it("keeps the busy robot's error in the trace and finishes the turn at the end of the stream", () => {
    const [turn] = play([
      start, ev({ type: "error", text: "the robot is already busy" }), { type: "end", id: 1, at: 9 },
    ]);
    expect(turn.items).toEqual([{ kind: "error", text: "the robot is already busy" }]);
    expect(turn.running).toBe(false);
    expect(turn.reply).toBeUndefined();
  });

  it("keeps earlier turns as they were and ignores actions for an unknown turn", () => {
    const first = play([start, ev({ type: "reply", text: "Listo." }), { type: "end", id: 1, at: 1 }]);
    const both = play([
      { type: "start", id: 2, text: "mirá", at: 2 },
      { type: "event", id: 7, event: { type: "reply", text: "nope" }, at: 3 },
      { type: "failed", id: 2, text: "network down", at: 4 },
    ], first);
    expect(both[0]).toBe(first[0]);
    expect(both[1]).toMatchObject({ instruction: "mirá", running: false, items: [{ kind: "error", text: "network down" }] });
  });
});
