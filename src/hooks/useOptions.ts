import { useEffect, useState } from "react";
import { fetchOptions } from "../api/backend";
import type { Options } from "../types";

/** Loads GET /api/options once on mount. */
export function useOptions() {
  const [options, setOptions] = useState<Options | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchOptions()
      .then((o) => {
        if (!cancelled) setOptions(o);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { options, error, loading: !options && !error };
}
