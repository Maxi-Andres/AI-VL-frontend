import { useCallback, useEffect, useRef, useState } from "react";
import { executeCommand, fetchSkills, setRobotCamera } from "../api/backend";
import type { SkillInfo } from "../api/backend";
import { useRobotCameraView } from "../hooks/useRobotCameraView";
import { Joystick } from "../components/control/Joystick";
import { useGamepad, PAD } from "../hooks/useGamepad";
import { StatusText, type Status } from "../components/ui/StatusText";
import { IconDeviceGamepad2, IconPlayerStopFilled } from "@tabler/icons-react";
import { ActionPad } from "../components/control/ActionPad";
import { Button } from "../components/ui/Button";
import { FullscreenButton } from "../components/ui/FullscreenButton";
import { useRobot } from "../components/layout/RobotContext";

// Max velocities per speed preset (m/s, m/s, rad/s). The executor also clamps.
const SPEEDS: Record<string, { vx: number; vy: number; vyaw: number }> = {
  slow: { vx: 0.3, vy: 0.2, vyaw: 0.6 },
  normal: { vx: 0.6, vy: 0.4, vyaw: 1.0 },
  fast: { vx: 1.0, vy: 0.6, vyaw: 1.6 },
};
const SPEED_NAMES = ["slow", "normal", "fast"] as const;
type Speed = (typeof SPEED_NAMES)[number];

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
  const [sayText, setSayText] = useState(""); // G1 TTS text
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
  useEffect(() => {
    fetchSkills(robot)
      .then((c) => {
        setSkills(c.skills);
        setDangerous(c.dangerous);
      })
      .catch(console.error);
  }, [robot]);

  // The robot camera is the backdrop. Start the bridge on mount, stop on unmount.
  const { frameUrl, connected } = useRobotCameraView(true, false);
  useEffect(() => {
    setRobotCamera("start").catch(() => {});
    return () => {
      setRobotCamera("stop").catch(() => {});
    };
  }, []);

  const stageRef = useRef<HTMLDivElement>(null);

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
  const speedRef = useRef<Speed>(speed);
  speedRef.current = speed;

  const stoppedRef = useRef(true);

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

  // Compute the current velocity from sticks + keys, scaled by the speed preset.
  const computeVel = useCallback((): Vel => {
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
    lx = clamp1(lx);
    ly = clamp1(ly);
    rx = clamp1(rx);
    const s = SPEEDS[speedRef.current];
    // Robot frame: +vx forward, +vy left, +vyaw left. Screen: up=+ly, right=+lx/+rx.
    return {
      vx: +(ly * s.vx).toFixed(3),
      vy: +(-lx * s.vy).toFixed(3),
      vyaw: +(-rx * s.vyaw).toFixed(3),
    };
  }, [padRef]);

  // Dispatch loop: send a fresh `move` when the vector meaningfully changes, and a
  // single `stop` when it returns to zero (or whenever disarmed).
  useEffect(() => {
    const id = setInterval(() => {
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
  }, [computeVel, sendMove, sendStop]);

  // Keyboard (desktop): track pressed keys; swallow the page's default scroll.
  useEffect(() => {
    if (isTouch) return;
    const KEYS = new Set([
      "w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright",
    ]);
    const down = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (!KEYS.has(key)) return;
      e.preventDefault();
      keysRef.current.add(key);
    };
    const up = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [isTouch]);

  // Safety: disarm (which makes the loop send a stop) if the tab is hidden or the
  // window loses focus — so switching away can't leave the robot driving.
  useEffect(() => {
    const disarm = () => setArmed(false);
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
    keysRef.current.clear();
    leftRef.current = { x: 0, y: 0 };
    rightRef.current = { x: 0 };
    sendStop();
    setStatus({ tone: "stopped", text: "Stopped" });
  }, [sendStop]);

  // Fire one preset skill (sit, hello, dance, gait…) from the side pad.
  const runAction = useCallback(
    (skill: string, params?: Record<string, unknown>) => {
      executeCommand(robot, skill, params ?? {}, safeMode)
        .then(setStatusFrom)
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
        PAD_DEBUG && console.log(`%c[pad] boton ${index} -> ${what}`, "color:#fbbf24");

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
          trace(`velocidad ${next}`);
          return next;
        });
        return;
      }
      const skill = PAD_SKILLS[index]?.find((n) => n in skills);
      if (!skill) {
        trace(
          PAD_SKILLS[index]
            ? `sin skill: ${robot} no tiene ninguno de [${PAD_SKILLS[index].join(", ")}]`
            : "sin asignar",
        );
        return;
      }
      if (!armedRef.current || !supportedRef.current) {
        trace(`skill "${skill}" ignorado: falta armar`);
        setStatus({ tone: "warn", text: "Arm to drive first" });
        return;
      }
      trace(`skill "${skill}"`);
      runAction(skill);
    },
    [estop, robot, runAction, skills],
  );
  padPressRef.current = handlePadPress;

  return (
    <main className="p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
      <div
        ref={stageRef}
        className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-line bg-black"
      >
        {frameUrl ? (
          // eslint-disable-next-line jsx-a11y/alt-text
          <img
            src={frameUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-contain"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
            {connected ? "Waiting for the robot camera…" : "Connecting…"}
          </div>
        )}

        {/* Top overlay: arm, speed, e-stop, status. */}
        <div className="absolute inset-x-0 top-0 flex flex-wrap items-center gap-2 bg-gradient-to-b from-black/60 to-transparent p-2.5">
          <Button
            variant={armed ? "primary" : "secondary"}
            aria-pressed={armed}
            onClick={() => setArmed((a) => !a)}
            title="While disarmed the robot never moves"
          >
            {armed ? "Armed" : "Arm to drive"}
          </Button>
          <Button variant="secondary" onClick={estop} title="Emergency stop">
            <span className="inline-flex items-center gap-1">
              <IconPlayerStopFilled size={14} stroke={2} />
              Stop
            </span>
          </Button>
          <div className="flex overflow-hidden rounded-md border border-white/25">
            {SPEED_NAMES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                className={`px-2 py-1 text-[11px] capitalize ${
                  speed === s ? "bg-white/80 text-black" : "bg-black/40 text-white/70"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          {pad && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] text-white/80"
              title={`Gamepad: ${pad.id}`}
            >
              <IconDeviceGamepad2 size={13} stroke={2} />
              Pad
            </span>
          )}
          <StatusText
            status={status}
            className="ml-auto max-w-[45%] text-xs text-white/80"
          />
          <FullscreenButton targetRef={stageRef} />
        </div>

        {/* Touch: two joysticks. Desktop: a key hint. */}
        {isTouch ? (
          <>
            <div className="absolute bottom-5 left-5">
              <Joystick
                label="Move"
                onChange={(x, y) => {
                  leftRef.current = { x, y };
                }}
              />
            </div>
            <div className="absolute bottom-5 right-5">
              <Joystick
                label="Rotate"
                axis="x"
                onChange={(x) => {
                  rightRef.current = { x };
                }}
              />
            </div>
          </>
        ) : (
          <div className="absolute inset-x-0 bottom-3 text-center text-xs text-white/70">
            {pad ? (
              <>
                <span className="font-semibold">Left stick</span> move ·{" "}
                <span className="font-semibold">Right stick</span> rotate ·{" "}
                <span className="font-semibold">Start</span> arm ·{" "}
                <span className="font-semibold">Back</span> stop ·{" "}
                <span className="font-semibold">LB/RB</span> speed
              </>
            ) : (
              <>
                <kbd className="font-semibold">W A S D</kbd> move ·{" "}
                <kbd className="font-semibold">← →</kbd> rotate
              </>
            )}
            {!armed && " · press “Arm to drive” first"}
          </div>
        )}
      </div>
        </div>

        <aside className="rounded-lg border border-line bg-panel p-3 lg:w-[300px]">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <h2 className="m-0 text-[13px] font-semibold uppercase tracking-[0.04em] text-muted">
              Preset actions
            </h2>
            <Button
              variant={safeMode ? "primary" : "secondary"}
              className={`px-2 py-1 text-[11px] ${
                safeMode ? "" : "!bg-[#c0392b] !text-white hover:!brightness-110"
              }`}
              aria-pressed={safeMode}
              title={
                dangerous.length
                  ? `Safe mode blocks anything that can make the robot lose its support or change control mode. Blocked for this robot: ${dangerous.join(", ")}. Turn off to allow them.`
                  : "Safe mode blocks skills that can make the robot lose its support or change control mode."
              }
              onClick={() => setSafeMode((s) => !s)}
            >
              {safeMode ? "Safe: on" : "Safe: OFF"}
            </Button>
          </div>
          {!supported ? (
            <p className="m-0 mb-2 text-xs text-[#ff9aa6]">
              “{robot}” is not supported by the executor yet. Switch to Go2 or G1
              in the header.
            </p>
          ) : (
            !armed && (
              <p className="m-0 mb-2 text-xs text-muted">Arm (top-left) to enable.</p>
            )
          )}

          {/* G1 speaks through its onboard speaker (TTS). Go2 has no TTS. */}
          {robot === "g1" && (
            <form
              className="mb-3 flex gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                const t = sayText.trim();
                if (t) runAction("say", { text: t });
              }}
            >
              <input
                value={sayText}
                onChange={(e) => setSayText(e.target.value)}
                placeholder="Type something to say…"
                className="min-w-0 flex-1 rounded-md border border-line bg-bg px-2 py-1 text-xs text-fg focus:border-accent focus:outline-none"
              />
              <Button
                type="submit"
                variant="secondary"
                className="px-2 py-1 text-[11px]"
                disabled={!armed || !sayText.trim()}
              >
                Say
              </Button>
            </form>
          )}

          <ActionPad
            skills={skills}
            dangerous={dangerous}
            disabled={!armed || !supported}
            safeMode={safeMode}
            onAction={runAction}
          />
        </aside>
      </div>
    </main>
  );
}
