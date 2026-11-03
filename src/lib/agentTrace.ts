// The /agent chat as data: every instruction a person sent and, under it, the trace of what
// the robot made of it, built from POST /api/agent's events. Pure — the page owns the clock
// and passes `at` in, so the same events always give the same chat.
import type { AgentEvent, AgentToolResult } from "../types";

/** One step a running tool reported (tool_event). */
export interface ToolStep {
  step: string;
  detail: string;
  at: number;
}

/** A tool run: its steps attach to it as they arrive, its result closes it. */
export interface ToolItem {
  kind: "tool";
  tool: string;
  args: Record<string, unknown>;
  steps: ToolStep[];
  startedAt: number;
  /** Set by its result, or by the run ending without one (STOP, a lost stream). */
  endedAt?: number;
  result?: AgentToolResult;
}

export type TraceItem =
  | { kind: "thought"; text: string }
  | { kind: "error"; text: string }
  | ToolItem;

/** One instruction and everything the robot said and did about it. */
export interface AgentTurn {
  id: number;
  /** What the person typed or said, as sent. */
  instruction: string;
  /** What the server received, when it differs (it trims). */
  heard?: string;
  understood?: string;
  plan?: string[];
  /** Thoughts, tool runs and errors, in the order they happened. */
  items: TraceItem[];
  reply?: string;
  /** Until the reply, or the stream ending without one. */
  running: boolean;
  /** STOP was pressed while it ran: the arm is on its way home. */
  stopping: boolean;
  startedAt: number;
}

export type AgentAction =
  | { type: "start"; id: number; text: string; at: number }
  | { type: "event"; id: number; event: AgentEvent; at: number }
  | { type: "stopping"; id: number }
  /** The stream is over, with or without a reply. */
  | { type: "end"; id: number; at: number }
  /** The request itself failed (network down): said in the trace, the run is over. */
  | { type: "failed"; id: number; text: string; at: number };

/** The open run of a tool: the newest one with that name still waiting for its result. A step
 * that names no open tool goes to the newest open one of any name. */
function openTool(items: TraceItem[], tool: string): number {
  let any = -1;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.kind !== "tool" || it.endedAt !== undefined) continue;
    if (it.tool === tool) return i;
    if (any < 0) any = i;
  }
  return any;
}

function closeTools(items: TraceItem[], at: number): TraceItem[] {
  return items.map((it) => (it.kind === "tool" && it.endedAt === undefined ? { ...it, endedAt: at } : it));
}

function replaceAt(items: TraceItem[], i: number, item: TraceItem): TraceItem[] {
  return items.map((it, j) => (j === i ? item : it));
}

function applyEvent(turn: AgentTurn, ev: AgentEvent, at: number): AgentTurn {
  switch (ev.type) {
    case "heard":
      return ev.text && ev.text !== turn.instruction.trim() ? { ...turn, heard: ev.text } : turn;
    case "understood":
      return { ...turn, understood: ev.text };
    case "plan":
      return { ...turn, plan: Array.isArray(ev.steps) ? ev.steps.map(String) : [] };
    case "thought":
      return { ...turn, items: [...turn.items, { kind: "thought", text: ev.text }] };
    case "error":
      return { ...turn, items: [...turn.items, { kind: "error", text: ev.text }] };
    case "tool":
      return {
        ...turn,
        items: [...turn.items, {
          kind: "tool", tool: ev.tool, args: ev.args && typeof ev.args === "object" ? ev.args : {},
          steps: [], startedAt: at,
        }],
      };
    case "tool_event": {
      const step = { step: ev.step, detail: ev.detail, at };
      const i = openTool(turn.items, ev.tool);
      if (i < 0) {
        // A step with no tool line above it: the tool line is made for it, so it still shows.
        return {
          ...turn,
          items: [...turn.items, { kind: "tool", tool: ev.tool, args: {}, steps: [step], startedAt: at }],
        };
      }
      const tool = turn.items[i] as ToolItem;
      return { ...turn, items: replaceAt(turn.items, i, { ...tool, steps: [...tool.steps, step] }) };
    }
    case "tool_result": {
      const result = ev.result && typeof ev.result === "object" ? ev.result : { ok: false };
      const i = openTool(turn.items, ev.tool);
      if (i < 0) {
        return {
          ...turn,
          items: [...turn.items, {
            kind: "tool", tool: ev.tool, args: {}, steps: [], startedAt: at, endedAt: at, result,
          }],
        };
      }
      const tool = turn.items[i] as ToolItem;
      return { ...turn, items: replaceAt(turn.items, i, { ...tool, endedAt: at, result }) };
    }
    case "reply":
      // The reply is the run's last word: it is over, and any tool still open ended with it.
      return { ...turn, reply: ev.text, running: false, items: closeTools(turn.items, at) };
    default:
      return turn; // an event this page does not know yet: ignored
  }
}

/** The chat reducer. Actions for a turn that is not in the chat are ignored. */
export function agentChat(turns: AgentTurn[], action: AgentAction): AgentTurn[] {
  if (action.type === "start") {
    return [...turns, {
      id: action.id, instruction: action.text, items: [], running: true, stopping: false,
      startedAt: action.at,
    }];
  }
  return turns.map((turn) => {
    if (turn.id !== action.id) return turn;
    switch (action.type) {
      case "event":
        return applyEvent(turn, action.event, action.at);
      case "stopping":
        return turn.running ? { ...turn, stopping: true } : turn;
      case "end":
        return turn.running || turn.items.some((it) => it.kind === "tool" && it.endedAt === undefined)
          ? { ...turn, running: false, items: closeTools(turn.items, action.at) }
          : turn;
      case "failed":
        return {
          ...turn, running: false,
          items: [...closeTools(turn.items, action.at), { kind: "error", text: action.text }],
        };
    }
  });
}

/** The tool running right now in this turn, if any (the one the elapsed clock is for). */
export function runningTool(turn: AgentTurn): ToolItem | null {
  if (!turn.running) return null;
  for (let i = turn.items.length - 1; i >= 0; i--) {
    const it = turn.items[i];
    if (it.kind === "tool" && it.endedAt === undefined) return it;
  }
  return null;
}
