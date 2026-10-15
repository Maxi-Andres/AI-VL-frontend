/**
 * The Joints page's arm control, the parts that are plain logic (no socket, no React) so they
 * can be tested on their own. The socket is hooks/useJointControl.ts; the panel is
 * components/joints/ControlPanel.tsx.
 */
import { HAND_JOINTS, JOINT_BY_URDF } from "./g1Joints";

/** The limits the robot applies to a target, as the relay reports them on "take". */
export interface TargetLimits {
  /** rad from where the joint was when control was taken; 0 = no such limit (full range). */
  excursion: number;
  /** rad kept inside the URDF range. */
  margin: number;
}

/** What the robot applies until the relay says otherwise (joint_ctl_core.hpp's defaults). */
export const DEFAULT_LIMITS: TargetLimits = { excursion: 0, margin: 0.05 };

/**
 * A COURTESY copy of the robot's limits for a slider: the URDF range minus the margin, and —
 * when an excursion is set — no further than that from where the joint started. g1_joint_sender
 * clamps to the same numbers whatever arrives (robot-command-relay/src/joint_ctl_core.hpp,
 * rule 4), so a stale copy here can only make the slider shorter, never the arm go further.
 */
export function targetRange(
  origin: number,
  lim: { lower: number; upper: number } | undefined,
  limits: TargetLimits = DEFAULT_LIMITS,
) {
  let lower = (lim?.lower ?? -Math.PI) + limits.margin;
  let upper = (lim?.upper ?? Math.PI) - limits.margin;
  if (limits.excursion > 0) {
    lower = Math.max(lower, origin - limits.excursion);
    upper = Math.min(upper, origin + limits.excursion);
  }
  return { lower, upper };
}

/** Degrees of target-vs-measured gap under which a joint is "there" and gets no ghost: the
 * arm holds a few degrees short of its command under gravity at the robot's gains. */
export const GHOST_MIN_RAD = (2 * Math.PI) / 180;

/**
 * What an event from the robot means to the operator: "stall <joint>" when a joint gave up
 * pushing (rule 8 of joint_ctl_core.hpp); "releasing <why>" when the hand-back ramp starts,
 * "released <why>" when it ends. Null when there is nothing to add — an
 * asked-for release in progress already shows as "Handing the arms back".
 */
export function describeEvent(event: string): string | null {
  const stall = /^stall (\S+)/.exec(event);
  if (stall) {
    const joint = stall[1].replace(/_/g, " ");
    return `${joint[0].toUpperCase()}${joint.slice(1)} pushed against something: it stopped ` +
      "where it was.";
  }
  const m = /^(releasing|released) (\S+)/.exec(event);
  if (!m) return null;
  const done = m[1] === "released";
  if (m[2] === "requested") return done ? "Released." : null;
  const why: Record<string, string> = {
    eof: "the link to the robot closed",
    deadman: "nothing arrived from this page for 5 s",
    state_lost: "the robot stopped reporting its joints",
    fsm_lost: "the robot's mode could not be read",
  };
  const reason = why[m[2]]
    ?? (m[2].startsWith("fsm_") ? `the robot left Walk (mode ${m[2].slice(4)})` : m[2]);
  return `${done ? "Released" : "Releasing"}: ${reason}.`;
}

/** True for a finger of a BrainCo hand (a JOINTS entry whose source is a hand). */
export function isFinger(urdf: string): boolean {
  const j = JOINT_BY_URDF.get(urdf);
  return !!j && j.source !== "body";
}

/** A finger angle (radians on its URDF joint) as the hand's own 0 open .. 1000 closed. */
export function fingerPos(urdf: string, rad: number): number {
  const j = JOINT_BY_URDF.get(urdf);
  if (!j || j.source === "body") throw new Error(`not a finger: ${urdf}`);
  const upper = HAND_JOINTS[j.index].upper;
  return Math.round(Math.min(1000, Math.max(0, (rad / upper) * 1000)));
}

/** The control-socket message that sets one joint: a finger goes in the hand's own units. */
export function controlMessage(urdf: string, rad: number) {
  const j = JOINT_BY_URDF.get(urdf);
  if (j && j.source !== "body")
    return { op: "hand", side: j.source, finger: j.index, pos: fingerPos(urdf, rad) };
  return { op: "target", joint: urdf.replace(/_joint$/, ""), q: rad };
}
