/**
 * The G1's joints as the robot reports them, mapped onto the 3D model the Joints page draws.
 *
 * Two orders meet here and this file is the only place that knows both:
 *   - the SDK's: motor_state[0..28] of rt/lowstate, and motor_state[0..6] of each Dex3 hand —
 *     what g1_joint_bridge (robot-command-relay) sends, as plain arrays;
 *   - the URDF's: joint NAMES in public/g1/g1.urdf (g1_29dof_lock_waist_with_hand_rev_1_0,
 *     the variant that matches this robot's mode_machine 6 — see scripts/build_g1_model.py).
 *
 * BODY order is the SDK's G1 29-DoF order, the same table the telemetry reader uses for its
 * Splunk fields (robot-telemetry-agent/src/g1_telemetry_reader.cpp). HAND order follows the
 * SDK's Dex3 example: its per-motor limits line up with the URDF's thumb_0..2, middle_0..1,
 * index_0..1 (middle and index have identical limits, so those two pairs are confirmed only
 * once a real hand is watched moving — step J1 of .claude/roadmap/G1-CONTROL-ARTICULAR.md).
 */

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

export const HAND_JOINTS = [
  "thumb_0", "thumb_1", "thumb_2", "middle_0", "middle_1", "index_0", "index_1",
] as const;

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

function pretty(name: string): string {
  return name.replace(/^(left|right)_/, "").replace(/_/g, " ");
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
    HAND_JOINTS.map((name, index) => ({
      urdf: `${side}_hand_${name}_joint`,
      label: name.replace("_", " "),
      source: side,
      index,
      group: (side === "left" ? "Left hand" : "Right hand") as JointGroup,
    })),
  ),
];

export const JOINT_BY_URDF = new Map(JOINTS.map((j) => [j.urdf, j]));

export const GROUPS: JointGroup[] = [
  "Left leg", "Right leg", "Waist", "Left arm", "Right arm", "Left hand", "Right hand",
];

// --------------------------------------------------------------------------------------------
// The wire format: one line of g1_joint_bridge per message (see its header for the fields)
// --------------------------------------------------------------------------------------------

export interface HandFrame {
  ageMs: number;
  q: number[];
  tau: number[];
  temp: number[];
}

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
  if (!isNumArray(h.q, n)) return null;
  return {
    ageMs: typeof h.age_ms === "number" ? h.age_ms : -1,
    q: h.q,
    tau: isNumArray(h.tau, n) ? h.tau : new Array(n).fill(0),
    temp: isNumArray(h.temp, n) ? h.temp : new Array(n).fill(0),
  };
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
  return { q: hand.q[j.index], tau: hand.tau[j.index], temp: hand.temp[j.index] };
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
    return { joint: joint.replace("_", " "), left, right, diff: left - sign * right };
  });
}

/** Degrees of left/right disagreement worth pointing at. */
export const LEG_DIFF_WARN_DEG = 3;
