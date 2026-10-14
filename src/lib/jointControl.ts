/**
 * The Joints page's arm control, the parts that are plain logic (no socket, no React) so they
 * can be tested on their own. The socket is hooks/useJointControl.ts; the panel is
 * components/joints/ControlPanel.tsx.
 */

/**
 * A COURTESY copy of the robot's limits for the slider: the URDF range minus MARGIN_RAD, and no
 * further than EXCURSION_RAD from where the joint was when control was taken. g1_joint_sender
 * clamps to the same numbers whatever arrives (robot-command-relay/src/joint_ctl_core.hpp,
 * rule 4), so a stale copy here can only make the slider shorter, never the arm go further.
 */
export const EXCURSION_RAD = 0.6;
export const MARGIN_RAD = 0.05;

export function targetRange(origin: number, lim: { lower: number; upper: number } | undefined) {
  const lower = Math.max((lim?.lower ?? -Infinity) + MARGIN_RAD, origin - EXCURSION_RAD);
  const upper = Math.min((lim?.upper ?? Infinity) - MARGIN_RAD, origin + EXCURSION_RAD);
  return { lower, upper };
}

/**
 * What a release event from the robot means to the operator: "releasing <why>" when the
 * hand-back ramp starts, "released <why>" when it ends. Null when there is nothing to add — an
 * asked-for release in progress already shows as "Handing the arms back".
 */
export function describeEvent(event: string): string | null {
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
