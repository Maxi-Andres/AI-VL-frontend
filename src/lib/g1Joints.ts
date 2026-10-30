/**
 * The G1's joints as the robot reports them, mapped onto the 3D model the Joints page draws.
 *
 * Two orders meet here and this file is the only place that knows both:
 *   - the robot's: motor_state[0..28] of rt/lowstate, and each hand's six fingers in BrainCo's
 *     order — what g1_joint_bridge (robot-command-relay) sends, as plain arrays;
 *   - the URDF's: joint NAMES in public/g1/g1.urdf (the lock-waist body that matches this
 *     robot's mode_machine 6, with BrainCo hands — see scripts/build_g1_model.py).
 *
 * BODY order is the SDK's G1 29-DoF order, the same table the telemetry reader uses for its
 * Splunk fields (robot-telemetry-agent/src/g1_telemetry_reader.cpp).
 *
 * HANDS: BrainCo Revo 2 (identified 2026-10-15 — after two wrong guesses, Dex3-1 and Inspire).
 * The bridge reads them over Modbus and sends each finger's position as the hand reports it:
 * 0 = fully open .. 1000 = fully closed. Each is drawn on its URDF joint as
 * angle = position / 1000 × the joint's upper limit; the URDF's other finger joints are `mimic`
 * joints that follow. Thumb flex and thumb rotation are the two that are easy to swap (Unitree's
 * own teleop code appears to): BrainCo's order — motor 0 flexes, motor 1 rotates — was confirmed
 * on both real thumbs on 2026-10-22 by moving only "thumb flex" and watching it bend.
 *
 * Labels and group names are marked with msg(): translate them with t() where they are shown.
 */
import { msg } from "../i18n";

export const BODY_JOINTS = [
  "left_hip_pitch", "left_hip_roll", "left_hip_yaw", "left_knee",
  "left_ankle_pitch", "left_ankle_roll",
  "right_hip_pitch", "right_hip_roll", "right_hip_yaw", "right_knee",
  "right_ankle_pitch", "right_ankle_roll",
  "waist_yaw", "waist_roll", "waist_pitch",
  "left_shoulder_pitch", "left_shoulder_roll", "left_shoulder_yaw", "left_elbow",
  "left_wrist_roll", "left_wrist_pitch", "left_wrist_yaw",
  "right_shoulder_pitch", "right_shoulder_roll", "right_shoulder_yaw", "right_elbow",
  "right_wrist_roll", "right_wrist_pitch", "right_wrist_yaw",
] as const;

/** A BrainCo hand's six motors in the hand's own order, with the URDF joint each one drives
 * (prefixed left_ / right_ in the model) and that joint's upper limit, radians. */
export const HAND_JOINTS = [
  { urdf: "thumb_proximal", label: msg("thumb flex"), upper: 1.0472 },
  { urdf: "thumb_metacarpal", label: msg("thumb rotation"), upper: 1.5184 },
  { urdf: "index_proximal", label: msg("index"), upper: 1.4661 },
  { urdf: "middle_proximal", label: msg("middle"), upper: 1.4661 },
  { urdf: "ring_proximal", label: msg("ring"), upper: 1.4661 },
  { urdf: "pinky_proximal", label: msg("pinky"), upper: 1.4661 },
] as const;

/** The relaxed hand: where both hands sat after power-on, read 2026-10-15 (thumbs at ~40%, the
 * other fingers at ~5%) — what the panel's "Relax" sends, in the hand's 0..1000. */
export const HAND_REST_POS = [400, 400, 50, 50, 50, 50] as const;

/** A finger position as the hand reports it (0 open .. 1000 closed) -> its URDF angle. */
export function fingerAngle(pos: number, upper: number): number {
  return (Math.min(1000, Math.max(0, pos)) / 1000) * upper;
}

/** Waist roll and pitch exist in the SDK's order but not as motors on this robot: it is the
 * lock-waist variant, so they read 0 with temperature 0 and the URDF makes them fixed. */
export const LOCKED_JOINTS = new Set(["waist_roll", "waist_pitch"]);

export type JointSource = "body" | "left" | "right";

export type JointGroup =
  | "Left leg" | "Right leg" | "Waist" | "Left arm" | "Right arm" | "Left hand" | "Right hand";

export interface JointRef {
  /** Stable id, also the URDF joint name. */
  urdf: string;
  label: string;
  source: JointSource;
  /** Index into that source's arrays. */
  index: number;
  group: JointGroup;
}

function bodyGroup(i: number): JointGroup {
  if (i < 6) return "Left leg";
  if (i < 12) return "Right leg";
  if (i < 15) return "Waist";
  if (i < 22) return "Left arm";
  return "Right arm";
}

/** A body joint's display name, the same for both sides ("left_shoulder_pitch" -> "shoulder
 * pitch"); the leg check names its pairs with these too. */
const BODY_LABEL: Record<string, string> = {
  hip_pitch: msg("hip pitch"), hip_roll: msg("hip roll"), hip_yaw: msg("hip yaw"),
  knee: msg("knee"), ankle_pitch: msg("ankle pitch"), ankle_roll: msg("ankle roll"),
  waist_yaw: msg("waist yaw"), waist_roll: msg("waist roll"), waist_pitch: msg("waist pitch"),
  shoulder_pitch: msg("shoulder pitch"), shoulder_roll: msg("shoulder roll"),
  shoulder_yaw: msg("shoulder yaw"), elbow: msg("elbow"), wrist_roll: msg("wrist roll"),
  wrist_pitch: msg("wrist pitch"), wrist_yaw: msg("wrist yaw"),
};

function pretty(name: string): string {
  const bare = name.replace(/^(left|right)_/, "");
  return BODY_LABEL[bare] ?? bare.replace(/_/g, " ");
}

export const JOINTS: JointRef[] = [
  ...BODY_JOINTS.map((name, index) => ({
    urdf: `${name}_joint`,
    label: pretty(name),
    source: "body" as const,
    index,
    group: bodyGroup(index),
  })),
  ...(["left", "right"] as const).flatMap((side) =>
    HAND_JOINTS.map((h, index) => ({
      urdf: `${side}_${h.urdf}_joint`,
      label: h.label,
      source: side,
      index,
      group: (side === "left" ? "Left hand" : "Right hand") as JointGroup,
    })),
  ),
];

export const JOINT_BY_URDF = new Map(JOINTS.map((j) => [j.urdf, j]));

/** Marked with msg() for translation; the union above stays the type. */
export const GROUPS = [
  msg("Left leg"), msg("Right leg"), msg("Waist"), msg("Left arm"), msg("Right arm"),
  msg("Left hand"), msg("Right hand"),
] as JointGroup[];

// --------------------------------------------------------------------------------------------
// The wire format: one line of g1_joint_bridge per message (see its header for the fields)
// --------------------------------------------------------------------------------------------

/** One hand, as the bridge sends it (in the hand's own units) plus the angles to draw. */
export interface HandFrame {
  ageMs: number;
  /** 0 open .. 1000 closed, per finger. */
  pos: number[];
  /** URDF angles, radians (fingerAngle of pos). */
  q: number[];
  /** Signed motor current, the hand's own scale. */
  current: number[];
  /** 0 idle, 1 running, 2 stalled, 3 turbo. */
  state: number[];
  /** Failed reads since the last good one. */
  errors: number;
  /** Fingertip normal force in newtons, thumb .. pinky (TOUCH_FINGERS: five tips for the six
   * motors). A null finger is a void reading (one of its status bits 0-2 set); a null array is a
   * hand that sends no touch at all. */
  touch: (number | null)[] | null;
}

/** The five fingertips of a Revo 2 Touch, in the order the hand reports them. */
export const TOUCH_FINGERS = [msg("thumb"), msg("index"), msg("middle"), msg("ring"), msg("pinky")] as const;
/** Which fingertip each of HAND_JOINTS' six motors ends in: both thumb motors share one tip. */
export const TOUCH_OF_MOTOR = [0, 0, 1, 2, 3, 4] as const;
/** The panel's full bar: a firm grip on a plastic bottle read 3-7 N on 2026-10-22. */
export const TOUCH_FULL_N = 10;
/** At or over this, the panel shows the fingertip as touching something. */
export const TOUCH_CONTACT_N = 0.5;

/** Shown with t(). */
export const FINGER_STATE = [msg("idle"), msg("moving"), msg("stalled"), msg("turbo")] as const;

export interface JointFrame {
  /** Robot clock, unix seconds. */
  t: number;
  /** Milliseconds since the robot's last lowstate; -1 = it never arrived. */
  ageMs: number;
  modeMachine: number | null;
  /** Pelvis IMU roll, pitch, yaw in radians. */
  imu: [number, number, number] | null;
  q: number[] | null;
  tau: number[] | null;
  temp: number[] | null;
  left: HandFrame | null;
  right: HandFrame | null;
}

export type StreamMessage =
  | { kind: "frame"; frame: JointFrame }
  | { kind: "stale" }
  | { kind: "error"; error: string; final: boolean };

const isNumArray = (v: unknown, n: number): v is number[] =>
  Array.isArray(v) && v.length === n && v.every((x) => typeof x === "number" && isFinite(x));

function parseHand(v: unknown): HandFrame | null {
  if (!v || typeof v !== "object") return null;
  const h = v as Record<string, unknown>;
  const n = HAND_JOINTS.length;
  if (!isNumArray(h.pos, n)) return null;
  const pos = h.pos;
  return {
    ageMs: typeof h.age_ms === "number" ? h.age_ms : -1,
    pos,
    q: pos.map((p, i) => fingerAngle(p, HAND_JOINTS[i].upper)),
    current: isNumArray(h.current, n) ? h.current : new Array(n).fill(0),
    state: isNumArray(h.state, n) ? h.state : new Array(n).fill(0),
    errors: typeof h.errors === "number" ? h.errors : 0,
    touch: parseTouch(h.touch),
  };
}

function parseTouch(v: unknown): (number | null)[] | null {
  if (!Array.isArray(v) || v.length !== TOUCH_FINGERS.length) return null;
  if (!v.every((x) => x === null || (typeof x === "number" && isFinite(x)))) return null;
  return v as (number | null)[];
}

/** One message off /ws/joints. Anything malformed is null: a bad line is dropped, never
 * half-applied to the model. */
export function parseStreamMessage(text: string): StreamMessage | null {
  let d: unknown;
  try {
    d = JSON.parse(text);
  } catch {
    return null;
  }
  if (!d || typeof d !== "object") return null;
  const o = d as Record<string, unknown>;
  if (typeof o.error === "string") return { kind: "error", error: o.error, final: !!o.final };
  if (o.stale === true) return { kind: "stale" };
  if (typeof o.t !== "number" || typeof o.age_ms !== "number") return null;
  const n = BODY_JOINTS.length;
  const q = isNumArray(o.q, n) ? o.q : null;
  return {
    kind: "frame",
    frame: {
      t: o.t,
      ageMs: o.age_ms,
      modeMachine: typeof o.mode_machine === "number" ? o.mode_machine : null,
      imu: isNumArray(o.imu, 3) ? [o.imu[0], o.imu[1], o.imu[2]] : null,
      q,
      tau: q && isNumArray(o.tau, n) ? o.tau : null,
      temp: q && isNumArray(o.temp, n) ? o.temp : null,
      left: parseHand(o.left),
      right: parseHand(o.right),
    },
  };
}

export interface JointReading {
  q: number;
  tau: number | null;
  temp: number | null;
  /** Hands only: the finger as the hand reports it. `touch` is its fingertip's force (N), null
   * for a void reading, undefined for a hand without touch. */
  finger?: { pos: number; current: number; state: number; touch?: number | null };
}

/** One joint's reading out of a frame, or null when that part of the robot is not reporting. */
export function readJoint(frame: JointFrame | null, j: JointRef): JointReading | null {
  if (!frame) return null;
  if (j.source === "body") {
    if (!frame.q) return null;
    return {
      q: frame.q[j.index],
      tau: frame.tau ? frame.tau[j.index] : null,
      temp: frame.temp ? frame.temp[j.index] : null,
    };
  }
  const hand = frame[j.source];
  if (!hand) return null;
  return {
    q: hand.q[j.index],
    tau: null,
    temp: null,
    finger: {
      pos: hand.pos[j.index],
      current: hand.current[j.index],
      state: hand.state[j.index],
      touch: hand.touch ? hand.touch[TOUCH_OF_MOTOR[j.index]] : undefined,
    },
  };
}

// --------------------------------------------------------------------------------------------
// What the page derives from a reading
// --------------------------------------------------------------------------------------------

export const deg = (rad: number) => (rad * 180) / Math.PI;

export type TempLevel = "normal" | "warm" | "hot" | "critical";

/** 80 °C is where the telemetry reader raises motor_over_temp (TEMP_WARN); the steps below it
 * are for seeing a joint heat up before that, not alarms. */
export function tempLevel(c: number | null): TempLevel {
  if (c === null || c < 55) return "normal";
  if (c < 70) return "warm";
  if (c < 80) return "hot";
  return "critical";
}

/**
 * The legs, left against right. On a robot hanging still, each left joint should read what its
 * right twin reads, mirrored: pitch and knee keep their sign, roll and yaw flip it (the URDF's
 * limits are mirrored the same way). A pair that disagrees by more than a few degrees while the
 * real legs hang the same is a joint zero that moved — which is the suspect behind the robot
 * leaning back (.claude/roadmap/G1.md §6.4).
 */
export const LEG_PAIRS = [
  ["hip_pitch", 1], ["hip_roll", -1], ["hip_yaw", -1],
  ["knee", 1], ["ankle_pitch", 1], ["ankle_roll", -1],
] as const;

export interface LegPairReading {
  joint: string;
  left: number;
  right: number;
  /** left − mirrored right, degrees. */
  diff: number;
}

export function legPairs(frame: JointFrame | null): LegPairReading[] {
  if (!frame?.q) return [];
  return LEG_PAIRS.map(([joint, sign]) => {
    const left = deg(frame.q![BODY_JOINTS.indexOf(`left_${joint}` as never)]);
    const right = deg(frame.q![BODY_JOINTS.indexOf(`right_${joint}` as never)]);
    return { joint: BODY_LABEL[joint], left, right, diff: left - sign * right };
  });
}

/** Degrees of left/right disagreement worth pointing at. */
export const LEG_DIFF_WARN_DEG = 3;
