import { useEffect, useRef, useState } from "react";
import { WS_LIDAR_CLOUD_URL, WS_LIDAR_URL, WS_ODOM_URL } from "../config";
import { t } from "../i18n";
import {
  parseCloudMessage,
  parseLidarMessage,
  parseOdomMessage,
  type CloudFrame,
  type LidarFrame,
  type OdomFrame,
} from "../lib/odom";

/**
 * The G1's live pose for the Navigation page: /ws/odom (backend -> executor -> relay ->
 * g1_odom_bridge). Read-only. Reconnects by itself with backoff, like the Joints page's source,
 * and shows the reason the backend gave when a stream ended.
 */
export type OdomLink = "connecting" | "live" | "stale" | "error";

export interface StreamState<F> {
  frame: F | null;
  link: OdomLink;
  error: string | null;
  /** Poses per second actually received, over the last 2 s. */
  hz: number;
}

const RETRY_MIN_MS = 1000;
const RETRY_MAX_MS = 10000;
/** Over this, the robot's odometry has stopped updating even if lines still arrive. */
export const ODOM_STALE_MS = 500;

export type OdomSourceState = StreamState<OdomFrame>;
export type LidarSourceState = StreamState<LidarFrame>;

export const useOdomSource = () => useRobotStream(WS_ODOM_URL, parseOdomMessage);
/** The lidar's obstacle map (/ws/lidar), the same way: read-only, reconnecting. */
export const useLidarSource = () => useRobotStream(WS_LIDAR_URL, parseLidarMessage);
/** The 3D cloud (/ws/lidar-cloud), ~1 Hz. Stale only after 3 s without one (it is slow). */
export const useCloudSource = () => useRobotStream(WS_LIDAR_CLOUD_URL, parseCloudMessage);
export type CloudSourceState = StreamState<CloudFrame>;

type Parsed<F> =
  | { kind: "frame"; frame: F & { ageMs: number } }
  | { kind: "stale" }
  | { kind: "error"; error: string; final: boolean };

function useRobotStream<F>(url: string, parse: (text: string) => Parsed<F> | null): StreamState<F> {
  const [state, setState] = useState<StreamState<F>>({
    frame: null, link: "connecting", error: null, hz: 0,
  });
  const stamps = useRef<number[]>([]);

  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | null = null;
    let retry: number | undefined;
    let backoff = RETRY_MIN_MS;
    let lastError: string | null = null;

    const rate = () => {
      const now = performance.now();
      const s = stamps.current;
      s.push(now);
      while (s.length && now - s[0] > 2000) s.shift();
      return s.length / 2;
    };

    const connect = () => {
      if (cancelled) return;
      ws = new WebSocket(url);
      ws.onmessage = (ev) => {
        const msg = parse(String(ev.data));
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
        const f = msg.frame;
        setState({ frame: f, link: f.ageMs > ODOM_STALE_MS ? "stale" : "live", error: null, hz: rate() });
      };
      ws.onclose = () => {
        if (cancelled) return;
        setState((s) => ({
          ...s, link: "error", error: lastError ?? t("Connection to the backend closed"), hz: 0,
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
    // `parse` is a module-level function per stream; the url decides the socket.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return state;
}
