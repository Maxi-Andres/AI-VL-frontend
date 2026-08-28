import { useEffect, useState } from "react";
import { fetchOptions } from "../api/backend";
import type { Options } from "../types";

/** Loads GET /api/options once on mount. */
export function useOptions() {
  const [options, setOptions] = useState<Options | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // The `cancelled` flag alone only silenced the setState; the request still ran to
    // completion in the background. Aborting frees the connection too, which matters on
    // mobile and under StrictMode's double-mount.
    const ac = new AbortController();
    fetchOptions(ac.signal)
      .then((o) => {
        if (!ac.signal.aborted) setOptions(o);
      })
      .catch((e: unknown) => {
        // An abort is our own teardown, not a failure to report.
        if (ac.signal.aborted) return;
        setError(e instanceof Error ? e.message : String(e));
      });
    return () => ac.abort();
  }, []);

  return { options, error, loading: !options && !error };
}
