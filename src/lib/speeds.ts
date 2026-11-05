// The speed presets of everything that walks a robot from the app — the drive pad and the
// Navigation page's walk to a point — so "Normal" means the same speed on both.
import { msg } from "../i18n";

// Max velocities per speed preset (m/s, m/s, rad/s), PER ROBOT. Below these sit two more
// clamps — the executor's (go2_/g1_commands MAX_*) and the relay's (MAX_* in its relay.env) —
// and the lowest one wins: until 2026-10-01 the relay's 0.6 (Go2) and 0.3 (G1) made "normal"
// and "fast" the same speed on the Go2 and all three the same on the G1. Keep "max" at or
// under both clamps. The robot's own controller caps each mode on top (Walk is slower than
// Run), so asking for more than a mode allows is harmless. Four steps since 2026-10-01: the
// Go2's are every speed it was driven at that day (the old normal 0.6 among them).
export const SPEED_NAMES = ["slow", "normal", "fast", "max"] as const;
export type Speed = (typeof SPEED_NAMES)[number];
export const SPEED_LABEL: Record<Speed, string> = {
  slow: msg("Slow"), normal: msg("Normal"), fast: msg("Fast"), max: msg("Max"),
};
export type Vel3 = { vx: number; vy: number; vyaw: number };
export const SPEEDS: Record<"go2" | "g1", Record<Speed, Vel3>> = {
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
