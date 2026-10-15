import { useCallback, useEffect, useRef, useState } from "react";
import { WS_JOINT_CONTROL_URL } from "../config";
import { DEFAULT_LIMITS, controlMessage, describeEvent, type TargetLimits } from "../lib/jointControl";

/**
 * Moving the G1's arm joints from the Joints page: /ws/joint-control on the backend, which
 * passes each op through the executor to the relay and g1_joint_sender on the robot.
 *
 * Every limit lives on the robot (robot-command-relay/src/joint_ctl_core.hpp): which joints,
 * how far, how fast, the weight ramps, the dead-man. This hook only names targets and keeps
 * the session alive:
 *
 *   - the socket opens on "Take control" and closes after the release; closing it for ANY
 *     reason (tab closed, page left, network gone) makes the backend release the arms;
 *   - a keepalive every KEEPALIVE_MS proves the page is still here — without one for ~1 s the
 *     robot freezes the arm, and after ~5 s it hands it back;
 *   - each joint (and each finger) sends at most one target per TARGET_MIN_MS, always its
 *     newest; different joints never overwrite each other's pending target (until 2026-10-15
 *     one shared slot made "everything back to where it started" send only the last joint).
 *   - fingers travel as {op: "hand", side, finger, pos 0..1000} (controlMessage in
 *     lib/jointControl.ts); every other joint as {op: "target", joint, q}.
 */
export type ControlPhase = "off" | "taking" | "up" | "active" | "down";

export interface JointControlState {
  phase: ControlPhase;
  /** The arm_sdk weight the robot reports: 0 = its own controller, 1 = this page. */
  weight: number;
  /** URDF joint names this session may move (the relay's JOINT_CTL_ALLOW). */
  allowed: string[];
  /** The limits the robot applies to targets, as the relay reported them. */
  limits: TargetLimits;
  /** The last thing worth telling the operator: a refusal, an error, a release reason. */
  message: string | null;
  messageTone: "ok" | "warn" | "error";
}

export interface JointControl extends JointControlState {
  take: () => void;
  release: () => void;
  target: (urdf: string, rad: number) => void;
}

const KEEPALIVE_MS = 250;
const TARGET_MIN_MS = 100;

interface Reply {
  op?: string;
  status?: number;
  ok?: boolean;
  state?: string;
  w?: number;
  allowed?: string[];
  excursion?: number;
  margin?: number;
  error?: string;
  reply?: string;
  event?: string | null;
}

const PHASES: Record<string, ControlPhase> = {
  idle: "up", up: "up", active: "active", down: "down", done: "down", off: "off",
};

const OFF: JointControlState = {
  phase: "off", weight: 0, allowed: [], limits: DEFAULT_LIMITS, message: null,
  messageTone: "ok",
};

export function useJointControl(): JointControl {
  const [state, setState] = useState<JointControlState>(OFF);
  const ws = useRef<WebSocket | null>(null);
  const phase = useRef<ControlPhase>("off");
  const pendingTargets = useRef(new Map<string, number>());
  const lastTargetAt = useRef(0);
  const targetTimer = useRef<number | null>(null);

  const update = useCallback((patch: Partial<JointControlState>) => {
    if (patch.phase) phase.current = patch.phase;
    setState((s) => ({ ...s, ...patch }));
  }, []);

  const send = (msg: object) => {
    const s = ws.current;
    if (s && s.readyState === WebSocket.OPEN) s.send(JSON.stringify(msg));
  };

  const close = useCallback(() => {
    const s = ws.current;
    ws.current = null;
    if (targetTimer.current !== null) window.clearTimeout(targetTimer.current);
    targetTimer.current = null;
    pendingTargets.current.clear();
    s?.close();
  }, []);

  const onReply = useCallback((r: Reply) => {
    const event = r.event ? describeEvent(r.event) : null;
    if (r.op === "take" && !r.ok) {
      update({ ...OFF, message: r.reply ?? r.error ?? "The robot refused", messageTone: "error" });
      close();
      return;
    }
    const next = r.state ? PHASES[r.state] : undefined;
    if (next === "off" || (r.status === 409 && r.error === "no control session")) {
      update({
        ...OFF,
        message: event ?? "Released.",
        messageTone: event && event !== "Released." ? "warn" : "ok",
      });
      close();
      return;
    }
    const patch: Partial<JointControlState> = {};
    if (next) patch.phase = next;
    if (typeof r.w === "number") patch.weight = r.w;
    if (r.op === "take" && r.allowed) {
      patch.allowed = r.allowed.map((j) => `${j}_joint`);
      patch.limits = {
        excursion: typeof r.excursion === "number" ? r.excursion : DEFAULT_LIMITS.excursion,
        margin: typeof r.margin === "number" ? r.margin : DEFAULT_LIMITS.margin,
      };
      patch.message = null;
    }
    if (!r.ok && r.op !== "keepalive") {
      patch.message = r.reply ?? r.error ?? "Refused";
      patch.messageTone = "error";
    } else if (event && r.event?.startsWith("stall ")) {
      patch.message = event;
      patch.messageTone = "warn";
    } else if (event && next === "down") {
      patch.message = event;
      patch.messageTone = "warn";              // a release the operator did not ask for
    }
    update(patch);
  }, [close, update]);

  const take = useCallback(() => {
    if (phase.current !== "off") return;
    update({ ...OFF, phase: "taking" });
    const s = new WebSocket(WS_JOINT_CONTROL_URL);
    ws.current = s;
    s.onopen = () => s.send(JSON.stringify({ op: "take" }));
    s.onmessage = (ev) => {
      try {
        onReply(JSON.parse(String(ev.data)) as Reply);
      } catch {
        /* a malformed reply changes nothing */
      }
    };
    s.onclose = () => {
      if (ws.current !== s) return;           // closed on purpose
      ws.current = null;
      if (phase.current !== "off") {
        update({
          ...OFF,
          message: "Control link lost: the robot is taking the arm back by itself.",
          messageTone: "warn",
        });
      }
    };
  }, [onReply, update]);

  const release = useCallback(() => send({ op: "release" }), []);

  const flushTarget = useCallback(() => {
    targetTimer.current = null;
    if (!pendingTargets.current.size) return;
    lastTargetAt.current = performance.now();
    for (const [urdf, rad] of pendingTargets.current) send(controlMessage(urdf, rad));
    pendingTargets.current.clear();
  }, []);

  const target = useCallback((urdf: string, rad: number) => {
    if (phase.current !== "up" && phase.current !== "active") return;
    pendingTargets.current.set(urdf, rad);
    const wait = TARGET_MIN_MS - (performance.now() - lastTargetAt.current);
    if (wait <= 0) flushTarget();
    else if (targetTimer.current === null)
      targetTimer.current = window.setTimeout(flushTarget, wait);
  }, [flushTarget]);

  // Keepalive while a session exists, including the hand-back ramp: its replies are also how
  // the page learns the ramp has finished.
  const live = state.phase === "up" || state.phase === "active" || state.phase === "down";
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => send({ op: "keepalive" }), KEEPALIVE_MS);
    return () => window.clearInterval(id);
  }, [live]);

  // Leaving the page closes the socket, and the backend releases the arms.
  useEffect(() => close, [close]);

  return { ...state, take, release, target };
}
