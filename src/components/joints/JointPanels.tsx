import type { ReactNode } from "react";
import type { JointSourceKind, JointSourceState } from "../../hooks/useJointSource";
import {
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

/** The Joints page's side panels. Presentational: everything comes in through props. */

const fmtDeg = (rad: number) => `${deg(rad).toFixed(1)}°`;

const TEMP_TEXT = {
  normal: "text-fg",
  warm: "text-[#f5b942]",
  hot: "text-[#f97316]",
  critical: "text-[#ef4444] font-semibold",
};

export function Section({ title, children, aside }: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="rounded-md border border-line bg-panel p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="m-0 text-xs font-semibold uppercase tracking-wider text-muted">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

// ------------------------------------------------------------------------------------------
// Source
// ------------------------------------------------------------------------------------------

function linkStatus(s: JointSourceState): Status {
  switch (s.link) {
    case "live":
      return { tone: "ok", text: `Live · ${s.hz.toFixed(0)} Hz` };
    case "replay":
      return { tone: "ok", text: `Replaying · ${s.hz} Hz` };
    case "connecting":
      return { tone: "busy", text: "Connecting to the robot…" };
    case "stale":
      return {
        tone: "warn",
        text: s.frame && s.frame.ageMs >= 0
          ? `Robot state not updating (last ${(s.frame.ageMs / 1000).toFixed(1)} s ago)`
          : "Connected, but the robot is not publishing its state",
      };
    case "error":
      return { tone: "error", text: `${s.error ?? "Disconnected"} — retrying` };
  }
}

export function SourcePanel({ kind, onKind, state, locked = false }: {
  kind: JointSourceKind;
  onKind: (k: JointSourceKind) => void;
  state: JointSourceState;
  /** While the page holds an arm the source stays Live: the operator must see the robot. */
  locked?: boolean;
}) {
  const opt = (k: JointSourceKind, label: string) => (
    <button
      type="button"
      onClick={() => onKind(k)}
      aria-pressed={kind === k}
      disabled={locked && kind !== k}
      className={`flex-1 cursor-pointer rounded px-2 py-1 text-xs disabled:cursor-default disabled:opacity-40 ${
        kind === k ? "bg-[#2a2e3a] font-semibold text-fg" : "text-muted hover:text-fg"
      }`}
    >
      {label}
    </button>
  );
  const tone = state.link === "error" ? "text-[#ff9aa6]" : state.link === "stale"
    ? "text-[#ffd08a]" : "text-muted";
  return (
    <Section title="Source">
      <div className="mb-2 flex gap-1 rounded-md border border-line bg-bg p-0.5">
        {opt("live", "Live robot")}
        {opt("replay", "Recorded walk")}
      </div>
      <StatusText status={linkStatus(state)} className={`text-xs ${tone}`} />
      {state.note && <p className="m-0 mt-1 text-xs text-muted">{state.note}</p>}
      <p className="m-0 mt-2 text-xs text-muted">
        Watching is read-only. Moving a joint is a separate step: Take control, below.
      </p>
    </Section>
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
      <div className="relative h-2 rounded-full bg-bg">
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
  const j = urdf ? JOINT_BY_URDF.get(urdf) : null;
  if (!j) {
    return (
      <Section title="Joint">
        <p className="m-0 text-sm text-muted">
          Point at a part of the robot, or pick a joint from the list.
        </p>
      </Section>
    );
  }
  const r = readJoint(frame, j);
  const lim = limits?.get(j.urdf);
  const locked = LOCKED_JOINTS.has(j.urdf.replace(/_joint$/, ""));
  const level = tempLevel(r?.temp ?? null);
  return (
    <Section title="Joint" aside={<span className="text-xs text-muted">{j.group}</span>}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold capitalize">{j.label}</span>
        <span className="font-mono text-2xl tabular-nums">{r ? fmtDeg(r.q) : "—"}</span>
      </div>
      <p className="m-0 mb-2 font-mono text-[11px] text-muted">{j.urdf}</p>
      {locked ? (
        <p className="m-0 text-xs text-muted">
          Locked on this robot: it is the lock-waist variant (mode_machine 6), so this joint has
          no motor and always reads 0.
        </p>
      ) : j.source !== "body" && !r ? (
        <p className="m-0 text-xs text-muted">
          No reading yet: the Inspire hands are driven by their own service, which is not wired
          to this page (step J4). The fingers are drawn at rest.
        </p>
      ) : (
        <>
          {lim && r && <RangeBar value={r.q} lower={lim.lower} upper={lim.upper} />}
          <dl className="m-0 mt-2 grid grid-cols-2 gap-1 text-sm">
            <dt className="text-muted">Torque</dt>
            <dd className="m-0 text-right font-mono tabular-nums">
              {r?.tau != null ? `${r.tau.toFixed(2)} N·m` : "—"}
            </dd>
            <dt className="text-muted">Temperature</dt>
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
  const imu = frame?.imu;
  return (
    <Section
      title="Body tilt (pelvis IMU)"
      aside={
        <label className="flex cursor-pointer items-center gap-1 text-xs text-muted">
          <input type="checkbox" checked={showTilt} onChange={(e) => onShowTilt(e.target.checked)} />
          Tilt the model
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
        Sign not yet confirmed on this robot: negative pitch is assumed to be leaning back (the
        ROS convention). A phone level on the chest settles it.
      </p>
    </Section>
  );
}

export function LegCheckPanel({ frame }: { frame: JointFrame | null }) {
  const pairs = legPairs(frame);
  return (
    <Section title="Legs, left vs right">
      <p className="m-0 mb-2 text-xs text-muted">
        Hang the robot in damping so both legs hang free. Each left joint should then read what
        its right twin reads, mirrored. A pair that is off by more than {LEG_DIFF_WARN_DEG}° while
        the legs look the same points at a joint zero that moved.
      </p>
      {pairs.length === 0 ? (
        <p className="m-0 text-sm text-muted">No leg readings yet.</p>
      ) : (
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="font-normal">Joint</th>
              <th className="text-right font-normal">Left</th>
              <th className="text-right font-normal">Right</th>
              <th className="text-right font-normal">Off by</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {pairs.map((p) => {
              const warn = Math.abs(p.diff) > LEG_DIFF_WARN_DEG;
              return (
                <tr key={p.joint}>
                  <td className="font-sans capitalize">{p.joint}</td>
                  <td className="text-right">{p.left.toFixed(1)}°</td>
                  <td className="text-right">{p.right.toFixed(1)}°</td>
                  <td className={`text-right ${warn ? "font-semibold text-[#ffd08a]" : "text-muted"}`}>
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
  return (
    <Section
      title="All joints"
      aside={
        <label className="flex cursor-pointer items-center gap-1 text-xs text-muted">
          <input
            type="checkbox"
            checked={colorByTemp}
            onChange={(e) => onColorByTemp(e.target.checked)}
          />
          Colour by temperature
        </label>
      }
    >
      <div className="grid gap-3">
        {GROUPS.map((g) => (
          <div key={g}>
            <h3 className="m-0 mb-1 text-xs font-semibold text-muted">{g}</h3>
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
                        active ? "bg-[#1d2a40]" : j.urdf === hovered ? "bg-[#1f222c]" : ""
                      }`}
                    >
                      <span className="capitalize text-fg">{j.label}</span>
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
