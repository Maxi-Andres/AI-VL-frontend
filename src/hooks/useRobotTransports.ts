import { useEffect, useState } from "react";
import { getRobotTransport, type RobotTransports } from "../api/backend";

/**
 * Per-robot transport state, including the backend's REACHABILITY PROBE.
 *
 * The `online` flag here is a real ICMP ping the backend runs against each robot's
 * `ping_ip` — it cannot be faked by a service reporting on itself, and it keeps working
 * when the robot is in the field and every other signal is about some subsystem instead
 * of the robot. That is why the presence pill uses this and not the camera bridge.
 *
 * `NetworkControls` and `RobotConfigPage` still call `getRobotTransport` directly. They
 * should move here — three copies of the same poll is the threshold in the standard — but
 * that is a separate change from fixing the pill.
 */
const POLL_MS = 5000;

export type TransportMap = NonNullable<RobotTransports["transports"]>;

export function useRobotTransports(): TransportMap | null {
  const [map, setMap] = useState<TransportMap | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    const ac = new AbortController();

    const run = async () => {
      try {
        const r = await getRobotTransport(ac.signal);
        if (!stopped && r.ok && r.transports) setMap(r.transports);
      } catch {
        // A failed poll leaves the last known value rather than blanking the pills:
        // one dropped request is not evidence that a robot went away.
      }
      if (!stopped) timer = window.setTimeout(run, POLL_MS);
    };
    void run();

    return () => {
      stopped = true;
      ac.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  return map;
}
