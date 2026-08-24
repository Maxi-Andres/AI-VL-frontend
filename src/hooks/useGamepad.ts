import { useEffect, useRef, useState } from "react";

/** Normalized stick vector: x right = +1, y up = +1; (0,0) at rest — the same
 * convention the touch `Joystick` reports, so both feed the drive loop alike. */
export interface PadSticks {
  lx: number;
  ly: number;
  rx: number;
  ry: number;
}

/** Standard-mapping button indices (https://w3c.github.io/gamepad/#remapping).
 * Xbox names; a PlayStation pad reports Cross/Circle/Square/Triangle in 0..3. */
export const PAD = {
  A: 0, B: 1, X: 2, Y: 3,
  LB: 4, RB: 5, LT: 6, RT: 7,
  BACK: 8, START: 9,
  L3: 10, R3: 11,
  UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15,
  GUIDE: 16,
} as const;

/** Button index -> readable name, for the debug log. Unknown indices (pads with
 * extra paddles / back buttons) just print their number. */
const PAD_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(PAD).map(([name, i]) => [i, name]),
);

interface Options {
  /** Radial deadzone per stick (0..1). Sticks rest a little off-center and would
   * otherwise trickle a permanent velocity into the drive loop. */
  deadzone?: number;
  /** Log every button edge and stick move to the console. On while bringing a new
   * pad up: it is the only way to see whether the browser gets the input at all,
   * and which index each physical button actually reports. */
  debug?: boolean;
  /** Rising edge: fired once when a button goes down. */
  onPress?: (index: number) => void;
  /** Falling edge: fired once when it comes back up. */
  onRelease?: (index: number) => void;
  /** The active pad went away (unplugged / went to sleep). */
  onDisconnect?: () => void;
}

/**
 * Reads the first connected gamepad through the Gamepad API.
 *
 * The API has no event for axis motion — it must be polled — so this runs a
 * requestAnimationFrame loop and writes the sticks into a ref instead of state:
 * the drive loop reads that ref on its own cadence and the page never re-renders
 * per frame. Buttons are edge-detected in the same loop and surfaced as callbacks.
 *
 * Browsers hide gamepads until the page has seen a user gesture, so the pad
 * usually appears only after the first button press (or any click on the page).
 */
export function useGamepad({
  deadzone = 0.15,
  debug = false,
  onPress,
  onRelease,
  onDisconnect,
}: Options = {}) {
  const sticks = useRef<PadSticks>({ lx: 0, ly: 0, rx: 0, ry: 0 });
  const [pad, setPad] = useState<{ index: number; id: string } | null>(null);

  // Callbacks live in a ref so re-renders don't tear down the polling loop.
  const cbs = useRef({ onPress, onRelease, onDisconnect });
  cbs.current = { onPress, onRelease, onDisconnect };

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.getGamepads) return;

    let raf = 0;
    let active: number | null = null;
    let prev: boolean[] = [];
    let lastLog: PadSticks = { lx: 0, ly: 0, rx: 0, ry: 0 }; // debug throttle

    /** Radial deadzone: zero the pair together (so a resting stick reads exactly
     * 0 on both axes) and rescale the rest, so the value ramps from 0 at the edge
     * of the deadzone instead of jumping. */
    const applyDeadzone = (x: number, y: number): [number, number] => {
      const m = Math.hypot(x, y);
      if (m < deadzone) return [0, 0];
      const k = ((m - deadzone) / (1 - deadzone)) / m;
      return [x * k, y * k];
    };

    const reset = () => {
      sticks.current = { lx: 0, ly: 0, rx: 0, ry: 0 };
      lastLog = { lx: 0, ly: 0, rx: 0, ry: 0 };
      prev = [];
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const pads = navigator.getGamepads();

      // Stay on the pad we picked; only look for another once it is gone.
      let gp = active !== null ? pads[active] : null;
      if (!gp?.connected) {
        gp = Array.from(pads).find((p): p is Gamepad => !!p?.connected) ?? null;
        if (gp) {
          active = gp.index;
          reset();
          setPad({ index: gp.index, id: gp.id });
          if (debug)
            console.log(
              `%c[gamepad] conectado #${gp.index}: ${gp.id} — ${gp.axes.length} ejes, ` +
                `${gp.buttons.length} botones, mapping="${gp.mapping || "(no estandar)"}"`,
              "color:#4ade80;font-weight:bold",
            );
        }
      }

      if (!gp) {
        if (active !== null) {
          active = null;
          reset();
          setPad(null);
          if (debug)
            console.log("%c[gamepad] desconectado", "color:#f87171;font-weight:bold");
          cbs.current.onDisconnect?.();
        }
        return;
      }

      const [lx, ly] = applyDeadzone(gp.axes[0] ?? 0, gp.axes[1] ?? 0);
      const [rx, ry] = applyDeadzone(gp.axes[2] ?? 0, gp.axes[3] ?? 0);
      // Pads report y down-positive; flip it so up is +1 like the touch joystick.
      sticks.current = { lx, ly: -ly, rx, ry: -ry };

      if (debug) {
        // One line per meaningful move, not one per frame — logging 60 Hz of noise
        // would bury the button presses you are actually looking for.
        const moved =
          Math.abs(lx - lastLog.lx) > 0.05 ||
          Math.abs(-ly - lastLog.ly) > 0.05 ||
          Math.abs(rx - lastLog.rx) > 0.05 ||
          Math.abs(-ry - lastLog.ry) > 0.05;
        if (moved) {
          lastLog = { ...sticks.current };
          const f = (v: number) => v.toFixed(2).padStart(5);
          console.log(
            `[gamepad] stick izq x=${f(lx)} y=${f(-ly)} | der x=${f(rx)} y=${f(-ry)}`,
          );
        }
      }

      for (let i = 0; i < gp.buttons.length; i++) {
        // Analog triggers report a value without ever setting `pressed` on some pads.
        const down = gp.buttons[i].pressed || gp.buttons[i].value > 0.5;
        const was = prev[i];
        if (down === was) continue;
        prev[i] = down;
        // First frame after (re)connecting only seeds the state — a button already
        // held then is not a fresh press, and must not fire an action.
        if (was === undefined) continue;
        if (debug)
          console.log(
            `%c[gamepad] boton ${i} (${PAD_NAMES[i] ?? "?"}) ${down ? "PRESS" : "release"}` +
              (gp.buttons[i].value > 0 && gp.buttons[i].value < 1
                ? ` valor=${gp.buttons[i].value.toFixed(2)}`
                : ""),
            `color:${down ? "#60a5fa" : "#94a3b8"}`,
          );
        if (down) cbs.current.onPress?.(i);
        else cbs.current.onRelease?.(i);
      }
    };

    if (debug)
      console.log(
        "%c[gamepad] escuchando. Si no aparece nada, hace un click en la pagina y " +
          "despues tocá un boton del joystick (el browser lo oculta hasta el primer gesto).",
        "color:#a78bfa",
      );

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [deadzone, debug]);

  return { sticks, pad, connected: pad !== null };
}
