import type { ReactNode } from "react";
import type { JointSourceKind, JointSourceState } from "../../hooks/useJointSource";
import { useT } from "../../i18n";
import {
  FINGER_STATE,
  GROUPS,
  JOINTS,
  JOINT_BY_URDF,
  LEG_DIFF_WARN_DEG,
  LOCKED_JOINTS,
  deg,
  legPairs,
  readJoint,
  tempLevel,
  type JointFrame,
} from "../../lib/g1Joints";
import { StatusText, type Status } from "../ui/StatusText";
import type { JointLimits } from "./RobotViewer";
import { Segmented } from "../ui/Segmented";

/** The Joints page's side panels. Presentational: everything comes in through props. */

const fmtDeg = (rad: number) => `${deg(rad).toFixed(1)}°`;

const TEMP_TEXT = {
  normal: "text-fg",
  warm: "text-warn-fg",
  hot: "text-[#f97316]",
  critical: "text-[#ef4444] font-semibold",
};

/** One block of a tab in the side panel; consecutive blocks are split by a rule. */
export function Section({ title, children, aside }: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="border-b border-line pb-4 last:border-0 last:pb-0">
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <h2 className="m-0 text-[13.5px] font-extrabold text-fg">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

// ------------------------------------------------------------------------------------------
// Source
// ------------------------------------------------------------------------------------------

function linkStatus(s: JointSourceState, t: ReturnType<typeof useT>): Status {
  switch (s.link) {
    case "live":
      return { tone: "ok", text: t("Live · {hz} Hz", { hz: s.hz.toFixed(0) }) };
    case "replay":
      return { tone: "ok", text: t("Replaying · {hz} Hz", { hz: s.hz }) };
    case "connecting":
      return { tone: "busy", text: t("Connecting to the robot…") };
    case "stale":
      return {
        tone: "warn",
        text: s.frame && s.frame.ageMs >= 0
          ? t("Robot state not updating (last {s} s ago)", { s: (s.frame.ageMs / 1000).toFixed(1) })
          : t("Connected, but the robot is not publishing its state"),
      };
    case "error":
      return {
        tone: "error",
        text: s.error ? t("{error} — retrying", { error: s.error }) : t("Disconnected — retrying"),
      };
  }
}

/** Live robot or the recorded walk, and how the stream is doing — the bar above the viewer. */
export function SourceBar({ kind, onKind, state, locked = false }: {
  kind: JointSourceKind;
  onKind: (k: JointSourceKind) => void;
  state: JointSourceState;
  /** While the page holds an arm the source stays Live: the operator must see the robot. */
  locked?: boolean;
}) {
  const t = useT();
  const opt = (k: JointSourceKind, label: string) => (
    <button
      type="button"
      onClick={() => onKind(k)}
      aria-pressed={kind === k}
      data-on={kind === k}
      disabled={locked && kind !== k}
      title={locked && kind !== k ? t("Release the arms first: while you hold them you watch the live robot.") : undefined}
      className={`cursor-pointer rounded-lg px-3 py-1.5 text-[12.5px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        kind === k ? "text-fg" : "text-muted hover:text-fg"
      }`}
    >
      {label}
    </button>
  );
  const tone = state.link === "error" ? "text-bad-fg" : state.link === "stale"
    ? "text-warn-fg" : state.link === "live" || state.link === "replay" ? "text-good-fg" : "text-muted";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <Segmented className="flex rounded-xl bg-subtle p-1">
        {opt("live", t("Live robot"))}
        {opt("replay", t("Recorded walk"))}
      </Segmented>
      <StatusText status={linkStatus(state, t)} className={`min-w-0 text-[12.5px] font-semibold ${tone}`} />
      {state.note && <span className="min-w-0 text-xs text-muted">{state.note}</span>}
    </div>
  );
}

// ------------------------------------------------------------------------------------------
// Inspector
// ------------------------------------------------------------------------------------------

function RangeBar({ value, lower, upper }: { value: number; lower: number; upper: number }) {
  const pct = Math.min(100, Math.max(0, ((value - lower) / (upper - lower)) * 100));
  const zero = ((0 - lower) / (upper - lower)) * 100;
  const out = value < lower || value > upper;
  return (
    <div>
      <div className="relative h-2 rounded-full bg-subtle">
        {zero > 0 && zero < 100 && (
          <span className="absolute top-[-2px] h-3 w-px bg-line" style={{ left: `${zero}%` }} />
        )}
        <span
          className={`absolute top-[-3px] h-3.5 w-1.5 -translate-x-1/2 rounded-sm ${
            out ? "bg-[#ef4444]" : "bg-accent2"
          }`}
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-muted tabular-nums">
        <span>{fmtDeg(lower)}</span>
        <span>0°</span>
        <span>{fmtDeg(upper)}</span>
      </div>
    </div>
  );
}

export function JointInspector({ urdf, frame, limits }: {
  urdf: string | null;
  frame: JointFrame | null;
  limits: JointLimits | null;
}) {
  const t = useT();
  const j = urdf ? JOINT_BY_URDF.get(urdf) : null;
  if (!j) {
    return (
      <Section title={t("Joint")}>
        <p className="m-0 text-sm text-muted">
          {t("Point at a part of the robot, or pick a joint from the list.")}
        </p>
      </Section>
    );
  }
  const r = readJoint(frame, j);
  const lim = limits?.get(j.urdf);
  const locked = LOCKED_JOINTS.has(j.urdf.replace(/_joint$/, ""));
  const level = tempLevel(r?.temp ?? null);
  return (
    <Section title={t("Joint")} aside={<span className="text-xs text-muted">{t(j.group)}</span>}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold capitalize">{t(j.label)}</span>
        <span className="font-mono text-2xl tabular-nums">{r ? fmtDeg(r.q) : "—"}</span>
      </div>
      <p className="m-0 mb-2 font-mono text-[11px] text-muted">{j.urdf}</p>
      {locked ? (
        <p className="m-0 text-xs text-muted">
          {t("Locked on this robot: it is the lock-waist variant (mode_machine 6), so this joint has no motor and always reads 0.")}
        </p>
      ) : j.source !== "body" && !r ? (
        <p className="m-0 text-xs text-muted">
          {t("This hand is not answering: its board reaches PC2 over a USB-C cable on the robot's back (found unplugged once), and the bridge looks for it again every 5 s.")}
        </p>
      ) : r?.finger ? (
        <dl className="m-0 grid grid-cols-2 gap-1 text-sm">
          <dt className="text-muted">{t("Closed")}</dt>
          <dd className="m-0 text-right font-mono tabular-nums">
            {(r.finger.pos / 10).toFixed(0)}%
          </dd>
          <dt className="text-muted">{t("Motor current")}</dt>
          <dd className="m-0 text-right font-mono tabular-nums">{r.finger.current}</dd>
          <dt className="text-muted">{t("Motor")}</dt>
          <dd className={`m-0 text-right ${r.finger.state === 2 ? "font-semibold text-warn-fg" : ""}`}>
            {FINGER_STATE[r.finger.state] !== undefined ? t(FINGER_STATE[r.finger.state]) : r.finger.state}
          </dd>
        </dl>
      ) : (
        <>
          {lim && r && <RangeBar value={r.q} lower={lim.lower} upper={lim.upper} />}
          <dl className="m-0 mt-2 grid grid-cols-2 gap-1 text-sm">
            <dt className="text-muted">{t("Torque")}</dt>
            <dd className="m-0 text-right font-mono tabular-nums">
              {r?.tau != null ? `${r.tau.toFixed(2)} N·m` : "—"}
            </dd>
            <dt className="text-muted">{t("Temperature")}</dt>
            <dd className={`m-0 text-right font-mono tabular-nums ${TEMP_TEXT[level]}`}>
              {r?.temp != null ? `${r.temp.toFixed(0)} °C` : "—"}
            </dd>
          </dl>
        </>
      )}
    </Section>
  );
}

// ------------------------------------------------------------------------------------------
// Tilt and legs: the two readings behind the "leans back" diagnosis
// ------------------------------------------------------------------------------------------

export function TiltPanel({ frame, showTilt, onShowTilt }: {
  frame: JointFrame | null;
  showTilt: boolean;
  onShowTilt: (v: boolean) => void;
}) {
  const t = useT();
  const imu = frame?.imu;
  return (
    <Section
      title={t("Body tilt (pelvis IMU)")}
      aside={
        <label className="flex cursor-pointer items-center gap-1 text-xs text-muted">
          <input type="checkbox" checked={showTilt} onChange={(e) => onShowTilt(e.target.checked)} />
          {t("Tilt the model")}
        </label>
      }
    >
      <dl className="m-0 grid grid-cols-2 gap-1 text-sm">
        <dt className="text-muted">Pitch</dt>
        <dd className="m-0 text-right font-mono tabular-nums">{imu ? fmtDeg(imu[1]) : "—"}</dd>
        <dt className="text-muted">Roll</dt>
        <dd className="m-0 text-right font-mono tabular-nums">{imu ? fmtDeg(imu[0]) : "—"}</dd>
      </dl>
      <p className="m-0 mt-2 text-xs text-muted">
        {t("Sign not yet confirmed on this robot: negative pitch is assumed to be leaning back (the ROS convention). A phone level on the chest settles it.")}
      </p>
    </Section>
  );
}

export function LegCheckPanel({ frame }: { frame: JointFrame | null }) {
  const t = useT();
  const pairs = legPairs(frame);
  return (
    <Section title={t("Legs, left vs right")}>
      <p className="m-0 mb-2 text-xs text-muted">
        {t("Hang the robot in damping so both legs hang free. Each left joint should then read what its right twin reads, mirrored. A pair that is off by more than {deg}° while the legs look the same points at a joint zero that moved.", { deg: LEG_DIFF_WARN_DEG })}
      </p>
      {pairs.length === 0 ? (
        <p className="m-0 text-sm text-muted">{t("No leg readings yet.")}</p>
      ) : (
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="font-normal">{t("Joint")}</th>
              <th className="text-right font-normal">{t("Left")}</th>
              <th className="text-right font-normal">{t("Right")}</th>
              <th className="text-right font-normal">{t("Off by")}</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {pairs.map((p) => {
              const warn = Math.abs(p.diff) > LEG_DIFF_WARN_DEG;
              return (
                <tr key={p.joint}>
                  <td className="font-sans capitalize">{t(p.joint)}</td>
                  <td className="text-right">{p.left.toFixed(1)}°</td>
                  <td className="text-right">{p.right.toFixed(1)}°</td>
                  <td className={`text-right ${warn ? "font-semibold text-warn-fg" : "text-muted"}`}>
                    {p.diff.toFixed(1)}°
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Section>
  );
}

// ------------------------------------------------------------------------------------------
// Every joint
// ------------------------------------------------------------------------------------------

export function JointTable({ frame, selected, hovered, onSelect, onHover, colorByTemp, onColorByTemp }: {
  frame: JointFrame | null;
  selected: string | null;
  hovered: string | null;
  onSelect: (urdf: string) => void;
  onHover: (urdf: string | null) => void;
  colorByTemp: boolean;
  onColorByTemp: (v: boolean) => void;
}) {
  const t = useT();
  return (
    <Section
      title={t("All joints")}
      aside={
        <label className="flex cursor-pointer items-center gap-1 text-xs text-muted">
          <input
            type="checkbox"
            checked={colorByTemp}
            onChange={(e) => onColorByTemp(e.target.checked)}
          />
          {t("Colour by temperature")}
        </label>
      }
    >
      <div className="grid gap-3">
        {GROUPS.map((g) => (
          <div key={g}>
            <h3 className="m-0 mb-1 text-xs font-semibold text-muted">{t(g)}</h3>
            <ul className="m-0 list-none p-0">
              {JOINTS.filter((j) => j.group === g).map((j) => {
                const r = readJoint(frame, j);
                const level = tempLevel(r?.temp ?? null);
                const active = j.urdf === selected;
                return (
                  <li key={j.urdf}>
                    <button
                      type="button"
                      onClick={() => onSelect(j.urdf)}
                      onMouseEnter={() => onHover(j.urdf)}
                      onMouseLeave={() => onHover(null)}
                      className={`flex w-full cursor-pointer items-baseline justify-between gap-2 rounded px-1.5 py-0.5 text-left text-sm ${
                        active ? "bg-info-bg" : j.urdf === hovered ? "bg-subtle" : ""
                      }`}
                    >
                      <span className="capitalize text-fg">{t(j.label)}</span>
                      <span className="font-mono tabular-nums">
                        {r?.temp != null && r.temp > 0 && (
                          <span className={`mr-2 text-xs ${TEMP_TEXT[level]}`}>
                            {r.temp.toFixed(0)}°C
                          </span>
                        )}
                        {r ? fmtDeg(r.q) : "—"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}
