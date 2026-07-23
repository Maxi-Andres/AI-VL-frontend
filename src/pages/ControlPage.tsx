import { useCallback, useEffect, useRef, useState } from "react";
import { executeCommand, setRobotCamera } from "../api/backend";
import { useRobotCameraView } from "../hooks/useRobotCameraView";
import { Joystick } from "../components/control/Joystick";
import { Button } from "../components/ui/Button";
import { FullscreenButton } from "../components/ui/FullscreenButton";

// Only the Go2 is wired in the executor today, so the drive pad targets it.
const ROBOT = "go2";

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

interface Vel {
  vx: number;
  vy: number;
  vyaw: number;
}

/**
 * Drive pad: shows the robot camera and steers the robot. On touch devices two
 * joysticks (left = translate fwd/back + strafe, right = rotate); on desktop
 * WASD to translate and ← → to rotate. Nothing moves until you ARM it, and it
 * always sends a stop when you release, disarm, hide the tab, or leave the page —
 * so the robot never runs away.
 */
export function ControlPage() {
  const [armed, setArmed] = useState(false);
  const [speed, setSpeed] = useState<Speed>("normal");
  const [status, setStatus] = useState("");
  const [isTouch] = useState(
    () => typeof window !== "undefined" &&
      window.matchMedia?.("(pointer: coarse)").matches,
  );

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
  const armedRef = useRef(armed);
  armedRef.current = armed;
  const speedRef = useRef<Speed>(speed);
  speedRef.current = speed;

  const stoppedRef = useRef(true);

  const setStatusFrom = useCallback(
    (r: { ok?: boolean; blocked?: boolean; detail?: string; error?: string }) => {
      if (r.blocked) setStatus(`⛔ ${r.error ?? "blocked"}`);
      else if (r.ok) setStatus(r.detail ?? "moving");
      else if (r.error) setStatus(`✗ ${r.error}`);
    },
    [],
  );

  const sendMove = useCallback(
    (v: Vel) => {
      executeCommand(
        ROBOT, "move", { ...v, continuous: false, duration_s: DURATION_S }, true)
        .then(setStatusFrom)
        .catch((e) => setStatus(`✗ ${e instanceof Error ? e.message : String(e)}`));
    },
    [setStatusFrom],
  );

  const sendStop = useCallback(() => {
    executeCommand(ROBOT, "stop", {}, false).catch(() => {});
  }, []);

  // Compute the current velocity from sticks + keys, scaled by the speed preset.
  const computeVel = useCallback((): Vel => {
    let lx = leftRef.current.x;
    let ly = leftRef.current.y;
    let rx = rightRef.current.x;
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
  }, []);

  // Dispatch loop: send a fresh `move` when the vector meaningfully changes, and a
  // single `stop` when it returns to zero (or whenever disarmed).
  useEffect(() => {
    const id = setInterval(() => {
      const v = computeVel();
      const isZero =
        Math.abs(v.vx) < DEAD && Math.abs(v.vy) < DEAD && Math.abs(v.vyaw) < DEAD;

      if (!armedRef.current || isZero) {
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
    setStatus("⏹ Stopped");
  }, [sendStop]);

  return (
    <main className="p-4">
      <div
        ref={stageRef}
        className="relative mx-auto aspect-[4/3] w-full max-w-4xl overflow-hidden rounded-lg border border-line bg-black"
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
            ⏹ Stop
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
          {status && (
            <span className="ml-auto max-w-[45%] truncate text-xs text-white/80">
              {status}
            </span>
          )}
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
            <kbd className="font-semibold">W A S D</kbd> move ·{" "}
            <kbd className="font-semibold">← →</kbd> rotate
            {!armed && " · press “Arm to drive” first"}
          </div>
        )}
      </div>
    </main>
  );
}
