// The browser's own fullscreen, for the WHOLE page — under a video stage that already fills
// the window (.stage-expanded), so the picture also covers the tabs and the address bar.
// Requested for <html>, never for the stage: the stage keeps its in-page expansion either
// way, and if the browser refuses or fails, that expansion is still there.
//
// History: requesting fullscreen for the stage element froze the whole of Firefox on this
// GNOME + NVIDIA desktop (2026-10-27) and the exact trigger was never isolated. The 3D view's
// leaked WebGL contexts, fixed the same day, are the main suspect. If the freeze comes back,
// drop enterScreen() from the callers: the in-page expansion works on its own.

export function enterScreen(): void {
  if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => undefined);
}

export function leaveScreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
}

/** Calls `cb` when the browser leaves fullscreen by itself (Esc, F11). Returns the unsubscribe. */
export function onScreenLeft(cb: () => void): () => void {
  const on = () => {
    if (!document.fullscreenElement) cb();
  };
  document.addEventListener("fullscreenchange", on);
  return () => document.removeEventListener("fullscreenchange", on);
}
