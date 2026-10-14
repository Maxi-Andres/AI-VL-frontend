import { IconHandStop, IconMinus, IconPlus } from "@tabler/icons-react";
import type { JointControl } from "../../hooks/useJointControl";
import { JOINT_BY_URDF, deg, readJoint, type JointFrame } from "../../lib/g1Joints";
import { targetRange } from "../../lib/jointControl";
import { Button } from "../ui/Button";
import { StatusText, type Status } from "../ui/StatusText";
import { Section } from "./JointPanels";
import type { JointLimits } from "./RobotViewer";

/**
 * "Move" — take an arm joint from the robot's own controller and move it a little.
 * Presentational: the page owns the control session, the targets and the selection.
 *
 * The slider's range is a courtesy copy of the robot's own limits (targetRange in
 * lib/jointControl.ts); the robot clamps to them whatever the slider sends.
 */
const NUDGE_RAD = (5 * Math.PI) / 180;

function phaseStatus(c: JointControl): Status {
  switch (c.phase) {
    case "off":
      return { tone: "stopped", text: "The robot's controller has the arms" };
    case "taking":
      return { tone: "busy", text: "Asking the robot…" };
    case "up":
      return { tone: "busy", text: `Taking the arms over · ${Math.round(c.weight * 100)}%` };
    case "active":
      return { tone: "ok", text: "This page holds the arms" };
    case "down":
      return { tone: "busy", text: `Handing the arms back · ${Math.round(c.weight * 100)}%` };
  }
}

const fmt = (rad: number) => `${deg(rad).toFixed(1)}°`;

export function ControlPanel({
  control, canTake, cannotTakeWhy, selected, frame, limits, origin, goals, onGoal, onSelect,
}: {
  control: JointControl;
  canTake: boolean;
  cannotTakeWhy: string | null;
  selected: string | null;
  frame: JointFrame | null;
  limits: JointLimits | null;
  /** Where each movable joint was when control was taken, radians. */
  origin: Record<string, number>;
  goals: Record<string, number>;
  onGoal: (urdf: string, rad: number) => void;
  onSelect: (urdf: string) => void;
}) {
  const inSession = control.phase !== "off" && control.phase !== "taking";
  const steering = control.phase === "up" || control.phase === "active";
  const joint = selected && control.allowed.includes(selected) ? selected : null;
  const ref = joint ? JOINT_BY_URDF.get(joint) : null;
  const measured = ref ? readJoint(frame, ref)?.q ?? null : null;
  const goal = joint ? goals[joint] : undefined;
  const range = joint && origin[joint] !== undefined
    ? targetRange(origin[joint], limits?.get(joint)) : null;
  const set = (rad: number) => {
    if (!joint || !range) return;
    onGoal(joint, Math.min(range.upper, Math.max(range.lower, rad)));
  };

  return (
    <Section title="Move">
      <StatusText status={phaseStatus(control)} className="text-xs text-muted" />
      {control.message && (
        <StatusText
          status={{
            tone: control.messageTone === "error" ? "error" : control.messageTone === "warn"
              ? "warn" : "ok",
            text: control.message,
          }}
          className={`mt-1 text-xs ${control.messageTone === "error" ? "text-[#ff9aa6]"
            : control.messageTone === "warn" ? "text-[#ffd08a]" : "text-muted"}`}
        />
      )}

      {!inSession ? (
        <>
          <p className="m-0 mt-2 text-xs text-muted">
            Moves one elbow through the robot's arm channel while its own controller keeps it
            balanced. The robot must be standing still in Walk. Keep the remote in hand.
          </p>
          <Button
            type="button"
            variant="accent"
            className="mt-2 w-full text-sm"
            disabled={!canTake || control.phase === "taking"}
            onClick={control.take}
          >
            Take control
          </Button>
          {cannotTakeWhy && <p className="m-0 mt-1 text-xs text-muted">{cannotTakeWhy}</p>}
        </>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap gap-1">
            {control.allowed.map((j) => (
              <button
                key={j}
                type="button"
                onClick={() => onSelect(j)}
                aria-pressed={j === joint}
                className={`cursor-pointer rounded px-2 py-0.5 text-xs capitalize ${
                  j === joint ? "bg-[#1d2a40] font-semibold text-fg" : "bg-bg text-muted hover:text-fg"
                }`}
              >
                {j.replace(/_joint$/, "").replace(/_/g, " ")}
              </button>
            ))}
          </div>
          {joint && range && goal !== undefined ? (
            <div className="mt-3">
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-muted">Target</span>
                <span className="font-mono tabular-nums">{fmt(goal)}</span>
              </div>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-muted">Measured</span>
                <span className="font-mono tabular-nums">{measured !== null ? fmt(measured) : "—"}</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Decrease by 5 degrees"
                  disabled={!steering}
                  onClick={() => set(goal - NUDGE_RAD)}
                  className="cursor-pointer rounded bg-[#2a2e3a] p-1 text-fg disabled:opacity-40"
                >
                  <IconMinus size={14} />
                </button>
                <input
                  type="range"
                  className="w-full accent-[#60a5fa]"
                  min={range.lower}
                  max={range.upper}
                  step={0.005}
                  value={goal}
                  disabled={!steering}
                  onChange={(e) => set(Number(e.target.value))}
                  aria-label="Target angle"
                />
                <button
                  type="button"
                  aria-label="Increase by 5 degrees"
                  disabled={!steering}
                  onClick={() => set(goal + NUDGE_RAD)}
                  className="cursor-pointer rounded bg-[#2a2e3a] p-1 text-fg disabled:opacity-40"
                >
                  <IconPlus size={14} />
                </button>
              </div>
              <div className="mt-1 flex justify-between font-mono text-[10px] text-muted tabular-nums">
                <span>{fmt(range.lower)}</span>
                <span>start {fmt(origin[joint])}</span>
                <span>{fmt(range.upper)}</span>
              </div>
              <button
                type="button"
                disabled={!steering}
                onClick={() => set(origin[joint])}
                className="mt-1 cursor-pointer text-xs text-accent2 underline-offset-2 hover:underline disabled:opacity-40"
              >
                Back to where it started
              </button>
            </div>
          ) : steering ? (
            <p className="m-0 mt-2 text-xs text-muted">
              Pick one of the joints above, or click it on the robot. Only these can be moved in
              this step.
            </p>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            className="mt-3 flex w-full items-center justify-center gap-1.5 text-sm"
            disabled={control.phase === "down"}
            onClick={control.release}
          >
            <IconHandStop size={16} />
            Release — give the arms back
          </Button>
        </>
      )}
    </Section>
  );
}
