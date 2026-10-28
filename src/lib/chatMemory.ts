// Which turns of a conversation the model no longer receives. iacore sends the newest turns that
// fit its window and says how many went (vlm_common: turns_sent of turns_total); the ones left
// out are the oldest answered questions — the same ones LivePage sends as history.

interface ShownTurn {
  id: number;
  kind: "analysis" | "question";
  question: string;
  answer: string;
}

/** Whether a turn goes to the model as history (LivePage's filter, and iacore's). */
export const sentAsHistory = (t: ShownTurn) => t.kind === "question" && !!t.question.trim() && !!t.answer.trim();

/** Ids of the first `count` turns that go as history: the ones that no longer do. */
export function forgottenTurns(turns: ShownTurn[], count: number): Set<number> {
  const out = new Set<number>();
  for (const t of turns) {
    if (out.size >= count) break;
    if (sentAsHistory(t)) out.add(t.id);
  }
  return out;
}
