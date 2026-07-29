import { useEffect, useState } from "react";
import { fetchPresence } from "../api/backend";
import type { Presence } from "../types";

/** How often to ask the gateway who is connected. The gateway caches a probe round
 * for ~1.5 s, so this is cheap even with several browsers open. */
const POLL_MS = 3000;

/**
 * Poll the gateway for who is attached (robot camera, browsers, services).
 *
 * `presence` is null until the first answer arrives (and stays null against a
 * gateway that has no /api/presence yet); `reachable` false means the GATEWAY itself
 * did not answer, in which case nothing else can be trusted and the UI shows a
 * single "gateway offline" pill. Polling pauses while the tab is hidden
 * (a phone in a pocket shouldn't keep waking the sidecars) and refreshes
 * immediately when it comes back.
 */
export function usePresence() {
  const [presence, setPresence] = useState<Presence | null>(null);
  const [reachable, setReachable] = useState(true);

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;

    const schedule = () => {
      if (!stopped) timer = window.setTimeout(run, POLL_MS);
    };

    const run = async () => {
      if (document.hidden) return schedule(); // idle tab: skip this round
      try {
        const p = await fetchPresence();
        if (stopped) return;
        setPresence(p);
        setReachable(true);
      } catch {
        if (stopped) return;
        setReachable(false);
      }
      schedule();
    };

    const onVisibility = () => {
      if (document.hidden) return;
      window.clearTimeout(timer);
      run();
    };

    run();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return { presence, reachable };
}
