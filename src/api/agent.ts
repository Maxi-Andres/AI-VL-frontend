// The /agent tab's two calls: carry out an instruction (a POST that answers with a stream of
// Server-Sent Events) and STOP.
import { backendFetch } from "./backend";
import { SseParser } from "../lib/sse";
import type { AgentEvent } from "../types";
import type { AgentHistoryTurn } from "../lib/agentTrace";

/** Why a refusal came back, from the body the backend sends with it (`detail` or `error`). */
async function refusal(r: Response, what: string): Promise<string> {
  try {
    const body = (await r.json()) as { detail?: unknown; error?: unknown };
    const why = body.error ?? body.detail;
    if (typeof why === "string" && why) return why;
  } catch {
    /* not JSON: the status says it */
  }
  return `${what} -> ${r.status}`;
}

/**
 * Carry out `text` with the robot's tools, calling `onEvent` for every event the moment it
 * arrives. Resolves when the stream ends (its `end` event, or the connection closing); a
 * refused request (403, 422, a 5xx) arrives as one `error` event, so the trace shows it like
 * any other. Throws only when the network itself fails or `signal` aborts.
 *
 * `history` is the conversation so far (historyOf), so "now put it on the table" knows what
 * "it" is; iacore sends the newest turns that fit to the model.
 *
 * MAY MOVE THE ROBOT. Aborting `signal` stops reading, NOT the robot — that is stopAgent().
 */
export async function runAgent(
  text: string,
  onEvent: (e: AgentEvent) => void,
  signal?: AbortSignal,
  history: AgentHistoryTurn[] = [],
): Promise<void> {
  const r = await backendFetch(`/api/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, history }),
    signal,
  });
  if (!r.ok || !r.body) {
    onEvent({ type: "error", text: await refusal(r, "POST /api/agent") });
    return;
  }
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  const parser = new SseParser();
  // True once `end` arrived: anything after it is not part of this run.
  let ended = false;
  const deliver = (messages: ReturnType<SseParser["push"]>) => {
    for (const m of messages) {
      if (ended) return;
      if (m.event === "end") {
        ended = true;
        return;
      }
      let ev: unknown;
      try {
        ev = JSON.parse(m.data);
      } catch {
        continue; // a line this page cannot read: dropped, the run goes on
      }
      if (ev && typeof ev === "object" && typeof (ev as { type?: unknown }).type === "string") {
        onEvent(ev as AgentEvent);
      }
    }
  };
  try {
    while (!ended) {
      const { done, value } = await reader.read();
      if (done) break;
      deliver(parser.push(decoder.decode(value, { stream: true })));
    }
    if (!ended) deliver(parser.push(decoder.decode()).concat(parser.flush()));
  } finally {
    if (ended) reader.cancel().catch(() => {});
  }
}

/** STOP: the run ends and the arm is taken home before letting go. Any role that can view
 * may press it. The run's own stream carries its last events and its reply after this. */
export async function stopAgent(): Promise<void> {
  const r = await backendFetch(`/api/agent/stop`, { method: "POST" });
  if (!r.ok) throw new Error(await refusal(r, "POST /api/agent/stop"));
}
