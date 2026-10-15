import { IconArrowBackUp, IconHandStop, IconMinus, IconPlus } from "@tabler/icons-react";
import type { JointControl } from "../../hooks/useJointControl";
import { GROUPS, JOINT_BY_URDF, deg, readJoint, type JointFrame } from "../../lib/g1Joints";
import { targetRange } from "../../lib/jointControl";
import { Button } from "../ui/Button";
import { StatusText, type Status } from "../ui/StatusText";
import { Section } from "./JointPanels";
import type { JointLimits } from "./RobotViewer";

/**
 * "Move" — take the arms from the robot's own controller and move any joint the robot allows
 * (since J3: every arm joint and the waist yaw, over their full range). One row per joint,
 * grouped like the joint list; the selected joint — clicked here or on the robot — is the
 * highlighted row. Presentational: the page owns the session, the targets and the selection.
 *
 * Each slider's range is a courtesy copy of the robot's own limits (targetRange in
 * lib/jointControl.ts, with the numbers the relay reported); the robot clamps to them whatever
 * a slider sends.
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

const fmt = (rad: number) => `${deg(rad).toFixed(0)}°`;

function JointRow({
  urdf, selected, steering, frame, limits, origin, goal, robotLimits, onGoal, onSelect,
}: {
  urdf: string;
  selected: boolean;
  steering: boolean;
  frame: JointFrame | null;
  limits: JointLimits | null;
  origin: number;
  goal: number;
  robotLimits: JointControl["limits"];
  onGoal: (urdf: string, rad: number) => void;
  onSelect: (urdf: string) => void;
}) {
  const ref = JOINT_BY_URDF.get(urdf);
  const label = ref?.label ?? urdf;
  const measured = ref ? readJoint(frame, ref)?.q ?? null : null;
  const range = targetRange(origin, limits?.get(urdf), robotLimits);
  const set = (rad: number) => onGoal(urdf, Math.min(range.upper, Math.max(range.lower, rad)));
  const btn = "cursor-pointer rounded bg-[#2a2e3a] p-0.5 text-fg disabled:opacity-40";
  return (
    <li
      className={`rounded px-1.5 py-1 ${selected ? "bg-[#1d2a40]" : ""}`}
      onPointerDown={() => onSelect(urdf)}
    >
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className={`capitalize ${selected ? "font-semibold text-fg" : "text-muted"}`}>
          {label}
        </span>
        <span className="font-mono tabular-nums">
          <span className="text-fg">{fmt(goal)}</span>
          <span className="text-muted"> · now {measured !== null ? fmt(measured) : "—"}</span>
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <button type="button" aria-label={`${label}: decrease by 5 degrees`}
          disabled={!steering} onClick={() => set(goal - NUDGE_RAD)} className={btn}>
          <IconMinus size={12} />
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
          aria-label={`${label} target`}
        />
        <button type="button" aria-label={`${label}: increase by 5 degrees`}
          disabled={!steering} onClick={() => set(goal + NUDGE_RAD)} className={btn}>
          <IconPlus size={12} />
        </button>
      </div>
    </li>
  );
}

export function ControlPanel({
  control, canTake, cannotTakeWhy, selected, frame, limits, origin, goals, onGoal, onSelect,
  onBackToStart,
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
  /** Every joint's target back to where it was when control was taken. */
  onBackToStart: () => void;
}) {
  const inSession = control.phase !== "off" && control.phase !== "taking";
  const steering = control.phase === "up" || control.phase === "active";
  const rows = control.allowed.filter((j) => goals[j] !== undefined && origin[j] !== undefined);

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
            Moves the arms and the waist through the robot's arm channel while its own
            controller keeps it balanced. The robot must be standing still in Walk. Keep the
            remote in hand: an arm can reach the body, and the robot backs a joint off if it
            pushes against something.
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
          {steering && (
            <div className="mt-2 grid gap-2">
              {GROUPS.map((g) => {
                const inGroup = rows.filter((j) => JOINT_BY_URDF.get(j)?.group === g);
                if (!inGroup.length) return null;
                return (
                  <div key={g}>
                    <h3 className="m-0 mb-0.5 text-xs font-semibold text-muted">{g}</h3>
                    <ul className="m-0 grid list-none gap-0.5 p-0">
                      {inGroup.map((j) => (
                        <JointRow
                          key={j}
                          urdf={j}
                          selected={j === selected}
                          steering={steering}
                          frame={frame}
                          limits={limits}
                          origin={origin[j]}
                          goal={goals[j]}
                          robotLimits={control.limits}
                          onGoal={onGoal}
                          onSelect={onSelect}
                        />
                      ))}
                    </ul>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={onBackToStart}
                className="flex cursor-pointer items-center gap-1 justify-self-start text-xs text-accent2 underline-offset-2 hover:underline"
              >
                <IconArrowBackUp size={14} />
                Everything back to where it started
              </button>
            </div>
          )}
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
