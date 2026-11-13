// The agent's run started from the Agent page, kept OUTSIDE the page.
//
// Leaving the page mid-run used to press STOP and drop the turn: switching to Navigation to watch
// the walk the agent had started stopped it, and coming back the instruction was not in the
// conversation (2026-11-13). The run now lives here, in the module: it goes on while another
// page is open, a page that opens mid-run shows it from its first event, and a run that ends
// with no page open is saved by whoever started it (endRun says so).
//
// Every change to the run's turn is kept as the chat reducer's own action (agentTrace), so a
// page catches up by replaying them.
import { agentChat, type AgentAction, type AgentTurn } from "./agentTrace";

export interface LiveRun {
  id: number;
  /** The conversation it was asked in (null: a new one, made by its first save). */
  chat: string | null;
  /** Every action of its turn so far, in order. */
  actions: AgentAction[];
}

type Page = (action: AgentAction) => void;

let live: LiveRun | null = null;
let page: Page | null = null;
let nextId = 1;

/** A turn id no page has used: ids outlive a page, so they are counted here. */
export function newTurnId(): number {
  return nextId++;
}

/** The run going on now, from any page of this tab (null: none). */
export function liveRun(): LiveRun | null {
  return live;
}

/** Start keeping a run: its "start" action is the first. */
export function beginRun(id: number, text: string, chat: string | null, at: number): void {
  live = { id, chat, actions: [] };
  record({ type: "start", id, text, at });
}

/** One more change to the running turn: kept, and handed to the page if one is open. */
export function record(action: AgentAction): void {
  if (!live || ("id" in action && action.id !== live.id)) return;
  live.actions.push(action);
  page?.(action);
}

/** The run is over ("end" or "failed"). Returns its turn, and whether a page was open to take
 * it — that page saves it; with none, the caller does. */
export function endRun(action: Extract<AgentAction, { type: "end" | "failed" }>): {
  turn: AgentTurn | null;
  taken: boolean;
} {
  if (!live || action.id !== live.id) return { turn: null, taken: false };
  record(action);
  const turn = turnOf(live);
  const taken = page !== null;
  live = null;
  return { turn, taken };
}

/** The run's turn as it stands. */
export function turnOf(run: LiveRun): AgentTurn | null {
  return run.actions.reduce(agentChat, [] as AgentTurn[])[0] ?? null;
}

/** The open page takes the run's changes from now on; call the returned function on leaving. */
export function attachPage(onAction: Page): () => void {
  page = onAction;
  return () => {
    if (page === onAction) page = null;
  };
}
