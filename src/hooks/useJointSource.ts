import { useEffect, useRef, useState } from "react";
import { WS_JOINTS_URL } from "../config";
import { BODY_JOINTS, parseStreamMessage, type JointFrame } from "../lib/g1Joints";

/**
 * Where the Joints page's robot pose comes from.
 *
 *   live    — /ws/joints: the real G1 through backend -> executor -> relay -> g1_joint_bridge.
 *             Read-only. Reconnects by itself, with backoff, after any failure; the backend
 *             always says why a stream ended before it closes, and that reason is shown.
 *   replay  — public/g1/sample-walk.json, a real walk recorded on 2026-10-13, looped. It is
 *             how the page is checked with the robot off: if the legs do not walk like legs,
 *             the joint table or a sign is wrong.
 */
export type JointSourceKind = "live" | "replay";

export type LinkState = "connecting" | "live" | "stale" | "error" | "replay";

export interface JointSourceState {
  frame: JointFrame | null;
  link: LinkState;
  /** Why the link is down, as the server said it. */
  error: string | null;
  /** Frames per second actually received, over the last 2 s. */
  hz: number;
  /** Shown under the source picker: what this data is. */
  note: string | null;
}

const RETRY_MIN_MS = 1000;
const RETRY_MAX_MS = 10000;
/** Over this, the robot's own state has stopped updating even if lines still arrive. */
export const STALE_AGE_MS = 500;

interface SampleFile {
  source: string;
  rate_hz: number;
  frames: { q: number[]; imu: [number, number, number] }[];
}

function useRate() {
  const stamps = useRef<number[]>([]);
  return () => {
    const now = performance.now();
    const s = stamps.current;
    s.push(now);
    while (s.length && now - s[0] > 2000) s.shift();
    return s.length / 2;
  };
}

export function useJointSource(kind: JointSourceKind): JointSourceState {
  const [state, setState] = useState<JointSourceState>({
    frame: null, link: kind === "live" ? "connecting" : "replay", error: null, hz: 0, note: null,
  });
  const tick = useRate();

  useEffect(() => {
    if (kind !== "replay") return;
    let cancelled = false;
    let timer: number | undefined;
    setState({ frame: null, link: "replay", error: null, hz: 0, note: "Loading recording…" });
    fetch(`${import.meta.env.BASE_URL}g1/sample-walk.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<SampleFile>;
      })
      .then((sample) => {
        if (cancelled) return;
        const valid = sample.frames.filter((f) => f.q.length === BODY_JOINTS.length);
        let i = 0;
        timer = window.setInterval(() => {
          const f = valid[i++ % valid.length];
          setState({
            frame: {
              t: Date.now() / 1000, ageMs: 0, modeMachine: 6, imu: f.imu, q: f.q,
              tau: null, temp: null, left: null, right: null,
            },
            link: "replay",
            error: null,
            hz: sample.rate_hz,
            note: `${sample.source}. No hands, torque or temperature in this recording.`,
          });
        }, 1000 / sample.rate_hz);
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setState((s) => ({ ...s, link: "error", error: `Recording not available: ${e}` }));
      });
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [kind]);

  useEffect(() => {
    if (kind !== "live") return;
    let cancelled = false;
    let ws: WebSocket | null = null;
    let retry: number | undefined;
    let backoff = RETRY_MIN_MS;
    let lastError: string | null = null;
    // Nothing from the recording may linger: a replayed pose shown as "live" is a lie.
    setState({ frame: null, link: "connecting", error: null, hz: 0, note: null });

    const connect = () => {
      if (cancelled) return;
      ws = new WebSocket(WS_JOINTS_URL);
      ws.onmessage = (ev) => {
        const msg = parseStreamMessage(String(ev.data));
        if (!msg) return;
        if (msg.kind === "error") {
          lastError = msg.error;
          return;           // the close that follows schedules the retry
        }
        if (msg.kind === "stale") {
          setState((s) => ({ ...s, link: "stale", error: null }));
          return;
        }
        backoff = RETRY_MIN_MS;
        lastError = null;
        const hz = tick();
        const f = msg.frame;
        setState({
          frame: f,
          link: f.ageMs < 0 || f.ageMs > STALE_AGE_MS ? "stale" : "live",
          error: null,
          hz,
          note: null,
        });
      };
      ws.onclose = () => {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          link: "error",
          error: lastError ?? "Connection to the backend closed",
          hz: 0,
        }));
        retry = window.setTimeout(connect, backoff);
        backoff = Math.min(RETRY_MAX_MS, backoff * 2);
      };
    };
    connect();
    return () => {
      cancelled = true;
      window.clearTimeout(retry);
      ws?.close();
    };
    // `tick` keeps its own ref; re-running this effect for it would reconnect for nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  return state;
}
