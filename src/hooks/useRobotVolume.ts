import { useCallback, useEffect, useRef, useState } from "react";
import { getRobotVolume, setRobotVolume } from "../api/backend";

/**
 * The robot speaker's volume, as the robot reports it, on the robot's own scale (Go2 0-10,
 * G1 0-100). The value follows a slider freely; the robot is told once it settles, not on
 * every step. Shared by Drive's speaker card and the Live assistant. Off (`enabled` false)
 * it asks nothing.
 */
export function useRobotVolume(robot: string, enabled = true) {
  const [volume, setVolume] = useState<number | null>(null);
  const [max, setMax] = useState(10);
  const [error, setError] = useState<string | null>(null);
  const commitTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!enabled) return;
    const ctl = new AbortController();
    setError(null);
    getRobotVolume(robot, ctl.signal)
      .then((r) => {
        if (r.ok && typeof r.volume === "number") {
          setVolume(r.volume);
          if (typeof r.max === "number") setMax(r.max);
        } else if (!ctl.signal.aborted) setError(r.error ?? "no volume");
      })
      .catch(() => {
        /* aborted, or the backend is down: the slider just stays empty */
      });
    return () => {
      ctl.abort();
      window.clearTimeout(commitTimer.current);
    };
  }, [robot, enabled]);

  const change = useCallback(
    (level: number) => {
      setVolume(level);
      window.clearTimeout(commitTimer.current);
      commitTimer.current = window.setTimeout(async () => {
        const r = await setRobotVolume(robot, level).catch(() => null);
        setError(r?.ok ? null : r?.error ?? "volume not set");
      }, 250);
    },
    [robot],
  );

  return { volume, max, error, change };
}
