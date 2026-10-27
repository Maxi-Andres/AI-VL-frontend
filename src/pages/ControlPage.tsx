import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { executeCommand, fetchSkills, setRobotCamera } from "../api/backend";
import type { SkillInfo } from "../api/backend";
import { useRobotCameraView } from "../hooks/useRobotCameraView";
import { useVideoTransport } from "../components/layout/VideoTransportContext";
import { VideoTransportSwitch } from "../components/live/VideoTransportSwitch";
import { RobotCameraSwitch } from "../components/live/RobotCameraSwitch";
import { Joystick } from "../components/control/Joystick";
import { useGamepad, PAD } from "../hooks/useGamepad";
import { StatusText, type Status } from "../components/ui/StatusText";
import {
  IconAdjustmentsHorizontal,
  IconBolt,
  IconDeviceGamepad2,
  IconFold,
  IconLayoutSidebarRightCollapse,
  IconLayoutSidebarRightExpand,
  IconList,
  IconMaximize,
  IconMinimize,
  IconPlayerPlayFilled,
  IconPlayerStopFilled,
  IconSearch,
  IconShieldCheck,
  IconShieldOff,
  IconSpeakerphone,
} from "@tabler/icons-react";
import { ADVANCED_GROUP, ActionPad, actionGroupTitles } from "../components/control/ActionPad";
import { RobotSpeaker } from "../components/control/RobotSpeaker";
import { choiceSendable, unsendableSkills } from "../components/control/unsendableSkills";
import { useRobotTransports } from "../hooks/useRobotTransports";
import { CameraCanvas } from "../components/live/CameraCanvas";
import { useRobot } from "../components/layout/RobotContext";

// Max velocities per speed preset (m/s, m/s, rad/s), PER ROBOT. Below these sit two more
// clamps — the executor's (go2_/g1_commands MAX_*) and the relay's (MAX_* in its relay.env) —
// and the lowest one wins: until 2026-10-01 the relay's 0.6 (Go2) and 0.3 (G1) made "normal"
// and "fast" the same speed on the Go2 and all three the same on the G1. Keep "max" at or
// under both clamps. The robot's own controller caps each mode on top (Walk is slower than
// Run), so asking for more than a mode allows is harmless. Four steps since 2026-10-01: the
// Go2's are every speed it was driven at that day (the old normal 0.6 among them).
const SPEED_NAMES = ["slow", "normal", "fast", "max"] as const;
type Speed = (typeof SPEED_NAMES)[number];
type Vel3 = { vx: number; vy: number; vyaw: number };
const SPEEDS: Record<"go2" | "g1", Record<Speed, Vel3>> = {
  go2: {
    slow: { vx: 0.3, vy: 0.2, vyaw: 0.6 },
    normal: { vx: 0.6, vy: 0.4, vyaw: 1.0 },
    fast: { vx: 1.0, vy: 0.5, vyaw: 1.5 },
    max: { vx: 1.8, vy: 0.8, vyaw: 2.5 },
  },
  g1: {
    slow: { vx: 0.3, vy: 0.2, vyaw: 0.5 },
    normal: { vx: 0.6, vy: 0.3, vyaw: 0.8 },
    fast: { vx: 0.9, vy: 0.4, vyaw: 1.0 },
    max: { vx: 1.2, vy: 0.5, vyaw: 1.2 },
  },
};

const DEAD = 0.02; // treat |v| below this as zero
const SEND_MS = 150; // dispatch cadence
// Deadman: each `move` is a BOUNDED step slightly longer than SEND_MS, refreshed
// every tick. Motion is continuous while we keep sending, but if this page freezes
// or dies the executor auto-stops within DURATION_S — the robot never runs away.
const DURATION_S = 0.4;
const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));

// Console trace of every stick move and button edge, plus what each button resolved
// to on this robot. On in dev so you can tell "the pad is not reaching the browser"
// apart from "the button is mapped to a skill this robot does not have".
const PAD_DEBUG = import.meta.env.DEV;

// Gamepad buttons that fire a preset skill. The catalog differs per robot (Go2 and
// G1 name things differently), so each entry lists candidates and the first one the
// selected robot actually has wins — a button with no match on this robot does
// nothing. Sticks, arm, stop and speed are handled separately in the press handler.
const PAD_SKILLS: Record<number, string[]> = {
  [PAD.A]: ["stand_up", "start"],
  [PAD.B]: ["stand_down", "damp"],
  [PAD.X]: ["hello", "wave_hand"],
  [PAD.Y]: ["recovery_stand", "balance_stand"],
  [PAD.UP]: ["high_stand", "stretch"],
  [PAD.DOWN]: ["sit", "squat"],
  [PAD.LEFT]: ["scrape", "shake_hand"],
  [PAD.RIGHT]: ["dance1", "pose"],
};

interface Vel {
  vx: number;
  vy: number;
  vyaw: number;
}

/**
 * Drive pad: shows the robot camera and steers the robot. On touch devices two
 * joysticks (left = translate fwd/back + strafe, right = rotate); on desktop
 * WASD to translate and ← → to rotate. A connected gamepad works everywhere and
 * drives the same loop: sticks steer, Start arms, Back stops, LB/RB change speed
 * and the face/d-pad buttons fire preset skills. Nothing moves until you ARM it, and it
 * always sends a stop when you release, disarm, hide the tab, or leave the page —
 * so the robot never runs away.
 */
export function ControlPage() {
  const [armed, setArmed] = useState(false);
  const [speed, setSpeed] = useState<Speed>("normal");
  const [status, setStatus] = useState<Status | null>(null);
  // SAFE mode gates every skill the executor marks dangerous — anything that can make
  // the robot lose its support or swap its control mode. Default ON.
  const [safeMode, setSafeMode] = useState(true);
  const [skills, setSkills] = useState<Record<string, SkillInfo>>({});
  const [dangerous, setDangerous] = useState<string[]>([]);
  const [isTouch] = useState(
    () => typeof window !== "undefined" &&
      window.matchMedia?.("(pointer: coarse)").matches,
  );

  // Robot comes from the global header selector. Go2 and G1 both have executors;
  // anything else disables driving/actions (with a notice).
  const { robot } = useRobot();
  const supported = robot === "go2" || robot === "g1";
  const supportedRef = useRef(supported);
  supportedRef.current = supported;

  // Load the selected robot's skill catalog (single source of truth for the buttons).
  // Cleared on a switch and guarded against a late reply: a slow Go2 answer landing after
  // the G1 was picked would otherwise put the Go2's buttons under the G1.
  useEffect(() => {
    let current = true;
    setSkills({});
    setDangerous([]);
    fetchSkills(robot)
      .then((c) => {
        if (!current) return;
        setSkills(c.skills);
        setDangerous(c.dangerous);
      })
      .catch(console.error);
    return () => {
      current = false;
    };
  }, [robot]);
  // What this robot's transport cannot deliver stays on the pad, marked and disabled.
  const transports = useRobotTransports();
  const unsendable = useMemo(
    () => unsendableSkills(skills, transports, robot), [skills, transports, robot]);
  const choiceOk = useMemo(() => choiceSendable(transports, robot), [transports, robot]);

  // The robot camera is the backdrop. Start the bridge on mount, stop on unmount.
  //
  // `false` DECLARES that the drive view wants no boxes — it no longer writes the shared
  // detection flag, and that distinction is the whole fix: this page used to seed
  // `{ enabled: false }` on every connect, so reloading the drive machine switched YOLO off
  // on the live machine. Declaring per connection means the drive view cannot reach anyone
  // else's state, and the producer skips iacore entirely while nobody wants boxes.
  const { frameUrl, connected, getLastFrameBlob } = useRobotCameraView(
    true, false, undefined, robot);
  // The view socket stays connected on either transport: it still carries the shared config
  // and the detection boxes. Only the PICTURE moves.
  const { transport, stream: h264Stream, intraCanvasRef } = useVideoTransport();
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !h264Stream) return;
    el.srcObject = h264Stream;              // srcObject cannot be set from JSX
    return () => {
      el.srcObject = null;
    };
  }, [h264Stream]);
  useEffect(() => {
    setRobotCamera("start").catch(() => {});
    return () => {
      setRobotCamera("stop").catch(() => {});
    };
  }, []);

  const stageRef = useRef<HTMLDivElement>(null);

  // Presentation only — none of this reaches the robot. The keys held right now (to light the
  // key caps), the side panel's tab/search/folds, the action log, and the fullscreen cockpit.
  const [pressed, setPressed] = useState<Set<string>>(() => new Set());
  const [tab, setTab] = useState<"actions" | "speak" | "log">("actions");
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set([ADVANCED_GROUP]));
  const toggleGroup = useCallback((t: string) => setCollapsed((c) => {
    const n = new Set(c);
    if (n.has(t)) n.delete(t);
    else n.add(t);
    return n;
  }), []);
  const [log, setLog] = useState<{ at: Date; what: string; ok: boolean; text: string }[]>([]);
  const [cockpit, setCockpit] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [videoMenu, setVideoMenu] = useState(false);
  useEffect(() => {
    const on = () => setCockpit(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const toggleCockpit = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stageRef.current?.requestFullscreen?.();
  }, []);

  // Live input sources (read in the dispatch loop; refs so they don't re-trigger it).
  const leftRef = useRef({ x: 0, y: 0 }); // translate stick
  const rightRef = useRef({ x: 0 }); // rotate stick
  const keysRef = useRef<Set<string>>(new Set());

  // Gamepad. Its press handler needs actions declared further down, so it goes
  // through a ref — the pad loop only ever calls it after mount, so the
  // indirection costs nothing and keeps the hook above `computeVel`, which reads
  // the sticks it exposes.
  const padPressRef = useRef<(index: number) => void>(() => {});
  const { sticks: padRef, pad } = useGamepad({
    debug: PAD_DEBUG,
    onPress: (i) => padPressRef.current(i),
    // Losing the pad mid-drive must not leave the robot rolling.
    onDisconnect: () => setArmed(false),
  });

  const armedRef = useRef(armed);
  armedRef.current = armed;

  // Switching robots disarms and puts Safe back on: the next robot starts from the same safe
  // state as a fresh page, never armed with the last robot's Safe: OFF. The stop goes to the
  // robot being LEFT — the dispatch loop's own stop would only reach the newly selected one.
  const prevRobotRef = useRef(robot);
  useEffect(() => {
    const left = prevRobotRef.current;
    if (left === robot) return;
    prevRobotRef.current = robot;
    if (armedRef.current) executeCommand(left, "stop", {}, false).catch(() => {});
    keysRef.current.clear();
    leftRef.current = { x: 0, y: 0 };
    rightRef.current = { x: 0 };
    setArmed(false);
    setSafeMode(true);
    setPosing(false);
    setStatus(null);
  }, [robot]);
  const speedRef = useRef<Speed>(speed);
  speedRef.current = speed;
  const robotRef = useRef(robot);
  robotRef.current = robot;

  const stoppedRef = useRef(true);
  // POSE (Go2): while on, the sticks tilt the body instead of walking — the robot reads them
  // from its joystick topic, so they go out as `joy`, not `move` (read off the bus 2026-10-01).
  // Ends with anything else sent to the robot: the relay's sender drops `joy` at any other verb.
  const [posing, setPosing] = useState(false);
  const posingRef = useRef(false);
  posingRef.current = posing;

  const setStatusFrom = useCallback(
    (r: { ok?: boolean; blocked?: boolean; detail?: string; error?: string }) => {
      if (r.blocked) setStatus({ tone: "blocked", text: r.error ?? "blocked" });
      else if (r.ok) setStatus({ tone: "ok", text: r.detail ?? "moving" });
      else if (r.error) setStatus({ tone: "error", text: r.error });
    },
    [],
  );

  const sendMove = useCallback(
    (v: Vel) => {
      executeCommand(
        robot, "move", { ...v, continuous: false, duration_s: DURATION_S }, true)
        .then(setStatusFrom)
        .catch((e) =>
          setStatus({
            tone: "error",
            text: e instanceof Error ? e.message : String(e),
          }));
    },
    [robot, setStatusFrom],
  );

  const sendStop = useCallback(() => {
    executeCommand(robot, "stop", {}, false).catch(() => {});
  }, [robot]);

  const sendJoy = useCallback(
    (rx: number, ry: number) => {
      executeCommand(robot, "joy", { lx: 0, ly: 0, rx, ry }, true)
        .then((r) => {
          // The sender refuses joy once pose is gone (any other verb ended it): stop tilting.
          if (!r.ok && /only in pose/.test(r.detail ?? "")) setPosing(false);
          setStatusFrom(r);
        })
        .catch(() => {});
    },
    [robot, setStatusFrom],
  );

  // The raw stick vector (-1..1) from touch, gamepad and keys, before any speed preset.
  const computeSticks = useCallback(() => {
    let lx = leftRef.current.x;
    let ly = leftRef.current.y;
    let rx = rightRef.current.x;
    // Gamepad: left stick translates, right stick X rotates — same axes as the
    // touch joysticks, so the three input sources simply add up.
    const p = padRef.current;
    lx += p.lx;
    ly += p.ly;
    rx += p.rx;
    const k = keysRef.current;
    if (k.has("w")) ly += 1;
    if (k.has("s")) ly -= 1;
    if (k.has("d")) lx += 1;
    if (k.has("a")) lx -= 1;
    if (k.has("arrowright")) rx += 1;
    if (k.has("arrowleft")) rx -= 1;
    return { lx: clamp1(lx), ly: clamp1(ly), rx: clamp1(rx) };
  }, [padRef]);

  // The current velocity: the sticks scaled by the speed preset.
  const computeVel = useCallback((): Vel => {
    const { lx, ly, rx } = computeSticks();
    const s = SPEEDS[robotRef.current === "g1" ? "g1" : "go2"][speedRef.current];
    // Robot frame: +vx forward, +vy left, +vyaw left. Screen: up=+ly, right=+lx/+rx.
    return {
      vx: +(ly * s.vx).toFixed(3),
      vy: +(-lx * s.vy).toFixed(3),
      vyaw: +(-rx * s.vyaw).toFixed(3),
    };
  }, [computeSticks]);

  // Dispatch loop: send a fresh `move` when the vector meaningfully changes, and a
  // single `stop` when it returns to zero (or whenever disarmed).
  useEffect(() => {
    const id = setInterval(() => {
      if (posingRef.current) {
        // Pose: the translate stick becomes the app's right stick (screen right = +rx,
        // up = +ry), raw. Released or disarmed, ONE zero goes out and the sticks rest.
        const { lx, ly } = computeSticks();
        const idle = !armedRef.current || (Math.abs(lx) < DEAD && Math.abs(ly) < DEAD);
        if (idle) {
          if (!stoppedRef.current) {
            sendJoy(0, 0);
            stoppedRef.current = true;
          }
          return;
        }
        sendJoy(+lx.toFixed(3), +ly.toFixed(3));
        stoppedRef.current = false;
        return;
      }
      const v = computeVel();
      const isZero =
        Math.abs(v.vx) < DEAD && Math.abs(v.vy) < DEAD && Math.abs(v.vyaw) < DEAD;

      if (!armedRef.current || !supportedRef.current || isZero) {
        if (!stoppedRef.current) {
          sendStop();
          stoppedRef.current = true;
        }
        return;
      }
      // Armed and moving: refresh the bounded move every tick (deadman).
      sendMove(v);
      stoppedRef.current = false;
    }, SEND_MS);
    return () => clearInterval(id);
  }, [computeSticks, computeVel, sendJoy, sendMove, sendStop]);

  // Keyboard (desktop): track pressed keys; swallow the page's default scroll.
  useEffect(() => {
    if (isTouch) return;
    const KEYS = new Set([
      "w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright",
    ]);
    // Keys typed INTO a field are text, not driving. This listener is on the whole window, so
    // without this check typing "hola" in the robot's say box lost every "a" (swallowed by
    // preventDefault) — and with the robot armed, every w/a/s/d in a word walked it.
    const typing = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
    const down = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (!KEYS.has(key) || typing(e.target)) return;
      e.preventDefault();
      keysRef.current.add(key);
      setPressed(new Set(keysRef.current));
    };
    const up = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
      setPressed(new Set(keysRef.current));
    };
    // F: the fullscreen cockpit. Not a driving key, and never while typing.
    const cockpitKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "f" && !typing(e.target) && !e.ctrlKey && !e.metaKey) toggleCockpit();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("keydown", cockpitKey);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("keydown", cockpitKey);
    };
  }, [isTouch, toggleCockpit]);

  // Safety: disarm (which makes the loop send a stop) if the tab is hidden or the
  // window loses focus — so switching away can't leave the robot driving.
  useEffect(() => {
    const disarm = () => {
      setArmed(false);
      keysRef.current.clear();
      setPressed(new Set());
    };
    const onVis = () => document.hidden && disarm();
    window.addEventListener("blur", disarm);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("blur", disarm);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // Belt-and-suspenders: stop once more on unmount.
  useEffect(() => () => sendStop(), [sendStop]);

  const estop = useCallback(() => {
    setArmed(false);
    setPosing(false);
    keysRef.current.clear();
    leftRef.current = { x: 0, y: 0 };
    rightRef.current = { x: 0 };
    sendStop();
    setStatus({ tone: "stopped", text: "Stopped" });
  }, [sendStop]);

  // Fire one preset skill (sit, hello, dance, gait…) from the side pad.
  const runAction = useCallback(
    (skill: string, params?: Record<string, unknown>) => {
      // Any skill ends pose steering (the sender drops joy); pose On starts it once accepted.
      setPosing(false);
      const t0 = performance.now();
      const what = params && Object.keys(params).length
        ? `${skill} ${Object.values(params).map(String).join(" ")}` : skill;
      executeCommand(robot, skill, params ?? {}, safeMode)
        .then((r) => {
          if (r.ok && skill === "pose" && params?.on !== false) setPosing(true);
          setStatusFrom(r);
          setLog((l) => [{
            at: new Date(), what, ok: !!r.ok,
            text: r.ok ? `acknowledged in ${Math.round(performance.now() - t0)} ms` : r.error ?? r.detail ?? "refused",
          }, ...l].slice(0, 60));
        })
        .catch((e) =>
          setStatus({
            tone: "error",
            text: e instanceof Error ? e.message : String(e),
          }));
    },
    [robot, safeMode, setStatusFrom],
  );

  // Gamepad buttons, mirroring what the on-screen controls do. Arm and stop are
  // always live (you must be able to stop with the pad); everything else obeys the
  // same arm + supported-robot gate as the buttons in the side pad.
  const handlePadPress = useCallback(
    (index: number) => {
      const trace = (what: string) =>
        PAD_DEBUG && console.log(`%c[pad] button ${index} -> ${what}`, "color:#fbbf24");

      if (index === PAD.START) {
        trace("ARM / DISARM");
        setArmed((a) => !a);
        return;
      }
      if (index === PAD.BACK) {
        trace("E-STOP");
        estop();
        return;
      }
      if (index === PAD.LB || index === PAD.RB) {
        const step = index === PAD.RB ? 1 : -1;
        setSpeed((cur) => {
          const i = SPEED_NAMES.indexOf(cur) + step;
          const next = SPEED_NAMES[Math.max(0, Math.min(SPEED_NAMES.length - 1, i))];
          trace(`speed ${next}`);
          return next;
        });
        return;
      }
      const skill = PAD_SKILLS[index]?.find((n) => n in skills && !unsendable.has(n));
      if (!skill) {
        trace(
          PAD_SKILLS[index]
            ? `no skill: ${robot} has none of [${PAD_SKILLS[index].join(", ")}]`
            : "unassigned",
        );
        return;
      }
      if (!armedRef.current || !supportedRef.current) {
        trace(`skill "${skill}" ignored: not armed`);
        setStatus({ tone: "warn", text: "Arm to drive first" });
        return;
      }
      trace(`skill "${skill}"`);
      runAction(skill);
    },
    [estop, robot, runAction, skills, unsendable],
  );
  padPressRef.current = handlePadPress;

  const vmax = SPEEDS[robot === "g1" ? "g1" : "go2"][speed];
  const battery = transports?.[robot]?.relay?.battery;
  const pct = typeof battery?.percent === "number" ? Math.round(battery.percent) : null;
  const groupTitles = actionGroupTitles(skills);
  const live = !!(frameUrl || (transport === "h264" && h264Stream) || transport === "intra");

  const keyCap = (k: string, label = k.toUpperCase()) => (
    <kbd className={`inline-grid h-6 min-w-6 place-items-center rounded-md border px-1.5 font-mono text-[11px] font-semibold transition ${
      pressed.has(k) ? "translate-y-px border-[#3fd6c4] bg-[#3fd6c4] text-[#04211e]" : "border-white/25 text-white"}`}>
      {label}
    </kbd>
  );

  const speedSeg = (glass: boolean) => (
    <div className={`flex rounded-lg p-0.5 ${glass ? "bg-white/10" : "bg-subtle"}`} title="Speed preset (LB / RB on a gamepad)">
      {SPEED_NAMES.map((s) => (
        <button key={s} type="button" onClick={() => setSpeed(s)}
          className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-bold capitalize transition ${
            speed === s
              ? glass ? "bg-[#3fd6c4]/25 text-[#5fe3d4]" : "bg-panel text-fg shadow-card"
              : glass ? "text-white/65 hover:text-white" : "text-muted hover:text-fg"}`}>
          {s}
        </button>
      ))}
    </div>
  );

  const stopButton = (big: boolean) => (
    <button type="button" onClick={estop} title="Emergency stop (Back on a gamepad)"
      className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#e5484e] to-[#c42f35] font-extrabold tracking-[0.06em] text-white shadow-[0_8px_20px_-8px_rgba(217,63,69,0.7)] transition active:scale-[0.97] ${
        big ? "px-5 py-2.5 text-sm" : "px-4 py-2 text-[13px]"}`}>
      <IconPlayerStopFilled size={16} />STOP
    </button>
  );

  const actionPad = (glass: boolean) => (
    <ActionPad
      skills={skills}
      unsendable={unsendable}
      choiceOk={choiceOk}
      dangerous={dangerous}
      disabled={!armed || !supported}
      safeMode={safeMode}
      onAction={runAction}
      query={query}
      collapsed={collapsed}
      onToggleGroup={toggleGroup}
      glass={glass}
    />
  );

  const glass = "border border-white/10 bg-[#0c1016]/65 text-white shadow-[0_20px_50px_-20px_rgba(0,0,0,0.6)] backdrop-blur-xl";

  return (
    <main className="grid gap-4 p-4 lg:h-[calc(100dvh-65px)] lg:grid-cols-[minmax(0,1fr)_380px] lg:overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-col gap-3">
        {/* Arm, safety, speed */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button type="button" aria-pressed={armed} onClick={() => setArmed((a) => !a)}
            title="While disarmed the robot never moves (Start on a gamepad)"
            className={`flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-bold shadow-card transition active:scale-[0.97] ${
              armed ? "bg-accent text-on-accent" : "bg-fg text-bg"}`}>
            <IconPlayerPlayFilled size={14} />
            {armed ? "Armed" : "Arm to drive"}
          </button>
          <span className={`flex min-w-0 items-center gap-2 text-[12.5px] font-semibold ${armed ? "text-good-fg" : "text-muted"}`}>
            <span className={`size-2 shrink-0 rounded-full ${armed ? "bg-good-fg shadow-[0_0_0_4px_var(--color-good-bg)]" : "bg-dim"}`} />
            <span className="truncate">
              {!supported ? `“${robot}” cannot be driven yet` : armed
                ? isTouch ? "Armed · use the sticks" : "Armed · W A S D to move, ← → to turn"
                : "Disarmed · sticks and keys are ignored"}
            </span>
          </span>
          <StatusText status={status} className="min-w-0 truncate text-xs text-muted" />
          <span className="flex-1" />
          <button type="button" aria-pressed={safeMode} onClick={() => setSafeMode((v) => !v)}
            title={dangerous.length
              ? `Safe mode blocks anything that can make the robot lose its support or change control mode. Blocked for this robot: ${dangerous.join(", ")}. Turn off to allow them.`
              : "Safe mode blocks skills that can make the robot lose its support or change control mode."}
            className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-[12.5px] font-bold transition ${
              safeMode ? "border-line bg-panel text-fg shadow-card" : "border-danger bg-bad-bg text-bad-fg"}`}>
            {safeMode ? <IconShieldCheck size={16} className="text-accent" /> : <IconShieldOff size={16} />}
            {safeMode ? "Safe mode" : "Safe mode OFF"}
            <span className={`relative h-5 w-9 rounded-full transition ${safeMode ? "bg-accent" : "bg-danger"}`}>
              <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${safeMode ? "left-[18px]" : "left-0.5"}`} />
            </span>
          </button>
          {speedSeg(false)}
        </div>

        {/* The stage: the robot's camera, and in fullscreen the whole cockpit. */}
        <div ref={stageRef}
          className={`relative min-h-[280px] flex-1 overflow-hidden bg-black ${cockpit ? "" : "rounded-2xl shadow-lift"}`}>
          {transport === "intra" && intraCanvasRef ? (
            // The all-intra branch paints itself; this component only places the canvas.
            <canvas ref={intraCanvasRef} className="absolute inset-0 h-full w-full object-contain" />
          ) : transport === "h264" && h264Stream ? (
            <video ref={videoRef} autoPlay muted playsInline className="absolute inset-0 h-full w-full object-contain" />
          ) : frameUrl ? (
            <CameraCanvas frameUrl={frameUrl} getBlob={getLastFrameBlob} className="absolute inset-0 h-full w-full object-contain" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-white/60">
              {connected ? "Waiting for the robot camera…" : "Connecting…"}
            </div>
          )}
          {!cockpit && <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/45" />}

          {/* Top: state chips, video settings, fullscreen */}
          <div className={`absolute inset-x-3 top-3 z-10 flex items-center gap-2 ${cockpit ? `rounded-2xl p-2 pl-3 ${glass}` : ""}`}>
            <span className="flex items-center gap-1.5 rounded-lg bg-black/55 px-2.5 py-1 text-[11.5px] font-extrabold tracking-wider text-white backdrop-blur">
              <span className={`size-2 rounded-full ${live ? "animate-pulse bg-[#ff5a5f]" : "bg-white/40"}`} />
              {live ? "LIVE" : "NO VIDEO"}
            </span>
            {cockpit && (
              <span className={`rounded-lg px-2.5 py-1 text-[11.5px] font-bold ${armed ? "bg-[#3fd6c4]/20 text-[#5fe3d4]" : "bg-white/10 text-white/70"}`}>
                {armed ? "Armed" : "Disarmed"}
              </span>
            )}
            {posing && (
              <span className="rounded-lg bg-accent/85 px-2.5 py-1 text-[11.5px] font-bold text-on-accent"
                title="Pose is on: the sticks tilt the body instead of walking. Turn Pose off (or press Stop) to walk again.">
                Pose: sticks tilt
              </span>
            )}
            {pad && (
              <span className="flex items-center gap-1.5 rounded-lg bg-black/55 px-2.5 py-1 text-[11.5px] font-semibold text-white backdrop-blur" title={`Gamepad: ${pad.id}`}>
                <IconDeviceGamepad2 size={14} />Gamepad
              </span>
            )}
            <span className="flex-1" />
            {cockpit && (
              <button type="button" onClick={() => setDrawer((d) => !d)} title="All actions"
                className="grid size-9 cursor-pointer place-items-center rounded-lg bg-white/10 text-white transition hover:bg-white/20">
                {drawer ? <IconLayoutSidebarRightCollapse size={18} /> : <IconLayoutSidebarRightExpand size={18} />}
              </button>
            )}
            <div className="relative">
              <button type="button" onClick={() => setVideoMenu((v) => !v)} title="Video quality and transport"
                className="grid size-9 cursor-pointer place-items-center rounded-lg bg-black/55 text-white backdrop-blur transition hover:bg-black/75">
                <IconAdjustmentsHorizontal size={18} />
              </button>
              {videoMenu && (
                <div className="absolute top-11 right-0 z-20 flex w-[300px] animate-rise flex-col gap-2 rounded-xl border border-line bg-panel p-3 text-fg shadow-lift">
                  {/* Here rather than only in Settings: this is the view being judged, so
                      the switch has to be within reach of the person judging it. */}
                  <VideoTransportSwitch />
                  <RobotCameraSwitch />
                </div>
              )}
            </div>
            <button type="button" onClick={toggleCockpit} title={cockpit ? "Leave fullscreen (Esc)" : "Fullscreen cockpit (F)"}
              className="grid size-9 cursor-pointer place-items-center rounded-lg bg-black/55 text-white backdrop-blur transition hover:bg-black/75">
              {cockpit ? <IconMinimize size={18} /> : <IconMaximize size={18} />}
            </button>
          </div>

          {/* Bottom: sticks on touch (and always in the cockpit), keys on desktop */}
          {(isTouch || cockpit) && (
            <>
              <div className={`absolute bottom-5 left-5 z-10 ${cockpit ? `rounded-full p-3 ${glass}` : ""}`}>
                <Joystick label="Move" onChange={(x, y) => { leftRef.current = { x, y }; }} />
              </div>
              <div className={`absolute bottom-5 z-10 ${cockpit ? `right-5 rounded-full p-3 ${glass} ${drawer ? "mr-[396px]" : ""}` : "right-5"}`}>
                <Joystick label="Rotate" axis="x" onChange={(x) => { rightRef.current = { x }; }} />
              </div>
            </>
          )}
          {!isTouch && (
            <div className={`pointer-events-none absolute inset-x-0 z-10 flex justify-center ${cockpit ? "bottom-28" : "bottom-4"}`}>
              <div className="flex items-center gap-2 rounded-xl bg-black/55 px-3 py-2 text-xs font-semibold text-white/75 backdrop-blur">
                {pad ? (
                  <>Left stick move · Right stick rotate · Start arm · Back stop · LB/RB speed</>
                ) : (
                  <>
                    {keyCap("w")}{keyCap("a")}{keyCap("s")}{keyCap("d")}<span>move</span>
                    {keyCap("arrowleft", "←")}{keyCap("arrowright", "→")}<span>turn</span>
                    {!armed && <span className="text-white/55">· arm first</span>}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Cockpit: speed, readings and STOP in one glass ribbon; all actions in a drawer. */}
          {cockpit && (
            <>
              <div className={`absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-2xl p-2 pl-4 ${glass}`}>
                <Reading label="Max speed" value={`${vmax.vx.toFixed(1)}`} unit="m/s" />
                {pct !== null && <Reading label="Battery" value={`${pct}`} unit="%" />}
                {speedSeg(true)}
                {stopButton(true)}
              </div>
              <aside className={`absolute top-[76px] right-3 bottom-3 z-10 flex w-[380px] flex-col overflow-hidden rounded-2xl transition-transform duration-300 ${glass} ${drawer ? "" : "translate-x-[calc(100%+24px)]"}`}>
                <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3 text-sm font-extrabold">
                  <IconBolt size={16} className="text-[#5fe3d4]" />All actions
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-3">{actionPad(true)}</div>
              </aside>
            </>
          )}
        </div>

        {/* Readings + STOP */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-line bg-panel px-4 py-2.5 shadow-card">
          <Reading label="Max speed" value={`${vmax.vx.toFixed(1)}`} unit={`m/s · ${speed}`} light />
          <Reading label="Battery" value={pct === null ? "—" : `${pct}`} unit={pct === null ? undefined : "%"} light />
          <Reading label="Gamepad" value={pad ? "Connected" : "None"} light />
          <span className="flex-1" />
          {stopButton(true)}
        </div>
      </div>

      {/* Side panel: its own scroll; the page never scrolls on desktop. */}
      <aside className="flex min-h-[420px] flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-card">
        <div className="m-3 mb-0 flex gap-0.5 rounded-xl bg-subtle p-1">
          {([
            ["actions", "Actions", IconBolt],
            ["speak", "Speak", IconSpeakerphone],
            ["log", "Log", IconList],
          ] as const).map(([id, label, Icon]) => (
            <button key={id} type="button" onClick={() => setTab(id)}
              className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg py-1.5 text-[12.5px] font-bold transition ${
                tab === id ? "bg-panel text-fg shadow-card" : "text-muted hover:text-fg"}`}>
              <Icon size={15} />{label}
            </button>
          ))}
        </div>

        {tab === "actions" && (
          <>
            <div className="flex gap-2 p-3 pb-2">
              <label className="flex h-9 flex-1 items-center gap-2 rounded-lg border border-line bg-bg px-2.5 focus-within:border-accent">
                <IconSearch size={15} className="text-dim" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search actions…"
                  className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-dim" />
              </label>
              <button type="button" title="Fold every group" onClick={() => setCollapsed(new Set(groupTitles))}
                className="grid size-9 cursor-pointer place-items-center rounded-lg border border-line text-muted transition hover:text-fg">
                <IconFold size={16} />
              </button>
            </div>
            {!supported ? (
              <p className="m-0 px-4 pb-2 text-xs text-bad-fg">“{robot}” is not supported by the executor yet. Pick a Go2 or a G1 in the header.</p>
            ) : !armed ? (
              <p className="m-0 px-4 pb-2 text-xs text-muted">Arm to drive (top left) to enable the actions.</p>
            ) : null}
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">{actionPad(false)}</div>
          </>
        )}
        {tab === "speak" && (
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {/* The robot's own speaker (Go2 and G1): the server makes the voice — the same
                voice the browser plays — and the robot plays it. Not gated by Arm: nothing here
                moves the robot. The G1's built-in TTS is still the `say` skill. */}
            {supported ? <RobotSpeaker robot={robot} /> : <p className="m-0 text-sm text-muted">No speaker on this robot.</p>}
          </div>
        )}
        {tab === "log" && (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
            {log.length === 0 ? (
              <p className="m-0 py-6 text-center text-sm text-muted">Actions you send appear here, with the robot's answer.</p>
            ) : (
              <ul className="m-0 list-none p-0">
                {log.map((e, i) => (
                  <li key={i} className="flex gap-3 border-b border-line py-2.5 last:border-0">
                    <span className={`mt-1.5 size-2 shrink-0 rounded-full ${e.ok ? "bg-good-fg" : "bg-bad-fg"}`} />
                    <div className="min-w-0 text-[13px]">
                      <b className="font-bold">{e.what}</b>
                      <div className={`text-xs ${e.ok ? "text-muted" : "text-bad-fg"}`}>{e.text}</div>
                    </div>
                    <span className="ml-auto shrink-0 font-mono text-[11px] text-dim">{e.at.toLocaleTimeString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </aside>
    </main>
  );
}

/** One reading in the bars: a small label over a number. */
function Reading({ label, value, unit, light }: { label: string; value: string; unit?: string; light?: boolean }) {
  return (
    <div className="flex flex-col leading-tight">
      <small className={`text-[10.5px] font-bold tracking-wider uppercase ${light ? "text-dim" : "text-white/55"}`}>{label}</small>
      <b className="text-[15px] font-bold">
        <span className="font-mono">{value}</span>
        {unit && <em className={`ml-1 text-[11px] font-semibold not-italic ${light ? "text-muted" : "text-white/55"}`}>{unit}</em>}
      </b>
    </div>
  );
}
