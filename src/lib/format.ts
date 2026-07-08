// Small formatting helpers shared across pages.

/** Human-readable duration: "820 ms" under a second, "9.8 s" above. */
export function fmtMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}
