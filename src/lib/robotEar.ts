// The robot's ear, as the page sees it: what each event from /ws/robot-ear means.
//
// The G1's own microphone is listened to on the server (backend -> iacore's ear, see
// AI-VL-core/src/ear_common.py): the page never gets audio, only these events. It answers the
// "command" ones like a spoken question, says "¿Sí?" on a bare "wake", and shows the rest.
import { t } from "../i18n";

export type EarState = "off" | "connecting" | "listening" | "hearing" | "error";

export interface EarView {
  state: EarState;
  /** The last thing the robot heard, as text. */
  heard: string;
  error: string | null;
}

export type EarAction = { kind: "command"; text: string } | { kind: "wake" } | null;

export const EAR_OFF: EarView = { state: "off", heard: "", error: null };

/** The robots whose own microphone the app can listen through (their relay serves it). */
export const ROBOTS_WITH_MIC = new Set(["g1"]);

/** The next view and what to do, for one message from /ws/robot-ear. */
export function earEvent(view: EarView, raw: unknown): { view: EarView; action: EarAction } {
  if (typeof raw !== "object" || raw === null) return { view, action: null };
  const e = raw as { type?: string; text?: unknown; error?: unknown };
  const text = typeof e.text === "string" ? e.text : "";
  switch (e.type) {
    case "listening":
      return { view: { ...view, state: "listening", error: null }, action: null };
    case "speech":
      return { view: { ...view, state: "hearing" }, action: null };
    case "heard":
      return { view: { ...view, state: "listening", heard: text }, action: null };
    case "wake":
      return { view: { ...view, state: "listening" }, action: { kind: "wake" } };
    case "command":
      return text
        ? { view: { ...view, state: "listening" }, action: { kind: "command", text } }
        : { view, action: null };
    case "error":
      return {
        view: { ...view, state: "error", error: typeof e.error === "string" ? e.error : "error" },
        action: null,
      };
    default:
      return { view, action: null };
  }
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
