// The robot's ear, as the page sees it: what each event from /ws/robot-ear means.
//
// The G1's own microphone is listened to on the server (backend -> iacore's ear, see
// AI-VL-core/src/ear_common.py): the page never gets audio, only these events. Since 2026-11-12
// the gateway holds the ear and says who answers what follows "Bender": in the "vlm" mode the
// page (the vision chat, as before), in the "agent" mode — and always while the robot walks —
// the agent, which answers through the robot ("agent" events). Each command / wake / barge
// event carries "to": "page" | "agent", and the page answers only its own.
import { t } from "../i18n";

export type EarState = "off" | "connecting" | "listening" | "hearing" | "error";

/** Who answers what the robot hears after "Bender". */
export type EarMode = "vlm" | "agent";
/** Who the gateway says answers one event: this page, or the agent (gateway-side). */
export type EarTo = "page" | "agent";

export interface EarView {
  state: EarState;
  /** The last thing the robot heard, as text. */
  heard: string;
  error: string | null;
  /** The mode the gateway says it is in (null until it says). */
  mode: EarMode | null;
}

// "barge": its name while the robot talks — stop talking, then answer `text` (or, empty, "¿Sí?").
export type EarAction =
  | { kind: "command"; text: string; to: EarTo }
  | { kind: "wake"; to: EarTo }
  | { kind: "barge"; text: string; to: EarTo }
  | { kind: "agent"; event: AgentEarEvent }
  | null;

/** One step of the agent's run on something the robot heard: its trace event, as /api/agent
 * streams them (heard, understood, plan, tool, tool_event, tool_result, reply, error), and
 * "end" when the run is over. */
export interface AgentEarEvent {
  type: string;
  text?: string;
  [key: string]: unknown;
}

export const EAR_OFF: EarView = { state: "off", heard: "", error: null, mode: null };

/** The robots whose own microphone the app can listen through (their relay serves it). */
export const ROBOTS_WITH_MIC = new Set(["g1"]);

/** The next view and what to do, for one message from /ws/robot-ear. */
export function earEvent(view: EarView, raw: unknown): { view: EarView; action: EarAction } {
  if (typeof raw !== "object" || raw === null) return { view, action: null };
  const e = raw as { type?: string; text?: unknown; error?: unknown; to?: unknown; mode?: unknown };
  const text = typeof e.text === "string" ? e.text : "";
  // An older gateway sent no "to": then the page answered everything, as it did.
  const to: EarTo = e.to === "agent" ? "agent" : "page";
  switch (e.type) {
    case "listening":
      return { view: { ...view, state: "listening", error: null }, action: null };
    case "speech":
      return { view: { ...view, state: "hearing" }, action: null };
    case "heard":
      return { view: { ...view, state: "listening", heard: text }, action: null };
    case "mode":
      return e.mode === "vlm" || e.mode === "agent"
        ? { view: { ...view, mode: e.mode }, action: null }
        : { view, action: null };
    case "wake":
      return { view: { ...view, state: "listening" }, action: { kind: "wake", to } };
    case "barge":
      return { view: { ...view, state: "listening" }, action: { kind: "barge", text, to } };
    case "command":
      return text
        ? { view: { ...view, state: "listening" }, action: { kind: "command", text, to } }
        : { view, action: null };
    case "agent": {
      const ev = (raw as { event?: unknown }).event;
      if (typeof ev !== "object" || ev === null || typeof (ev as { type?: unknown }).type !== "string") {
        return { view, action: null };
      }
      const event = { ...(ev as AgentEarEvent) };
      if (typeof event.text !== "string") delete event.text;
      return { view, action: { kind: "agent", event } };
    }
    case "error":
      return {
        view: { ...view, state: "error", error: typeof e.error === "string" ? e.error : "error" },
        action: null,
      };
    default:
      return { view, action: null };
  }
}

// The robots' names, and the device's wake word, at the start of something said to it.
const NAMES = /^[\s,.;:!¡?¿-]*(b[eé]nd[eé]r|huesos|robot)\b[\s,.;:!?-]*/i;

/** What a phrase spoken on the device's mic asks, without the names it opens with: "Bender,
 * ¿qué ves?" -> "¿qué ves?"; "" when it was only names ("Bender Bender Bender" was sent as the
 * question, 2026-10-28) — the same as the robot's ear (iacore ear_common.wake_command). */
export function spokenRequest(text: string): string {
  let rest = text.trim();
  for (let m = NAMES.exec(rest); m && m[0]; m = NAMES.exec(rest)) rest = rest.slice(m[0].length);
  return rest.trim();
}

/** One line for the panel. */
export function earStatus(view: EarView): string {
  switch (view.state) {
    case "off":
      return "";
    case "connecting":
      return t("Robot mic: turning on…");
    case "hearing":
      return t("Robot mic: hearing someone…");
    case "listening":
      return view.heard
        ? t("Robot mic heard: “{text}” — say “Bender, …”", { text: view.heard })
        : t("Robot mic: listening for “Bender”");
    case "error":
      return t("Robot mic off: {error}", { error: view.error ?? t("the connection closed") });
  }
}
