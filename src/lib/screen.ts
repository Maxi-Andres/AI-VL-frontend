// The browser's own fullscreen, for the WHOLE page — under a video stage that already fills
// the window (.stage-expanded), so the picture also covers the tabs and the address bar.
// Requested for <html>, never for the stage: the stage keeps its in-page expansion either
// way, and if the browser refuses or fails, that expansion is still there.
//
// Known risk, kept on by decision (2026-10-27): on the GNOME + NVIDIA desktop this runs on, the
// switch into or out of native fullscreen freezes the whole of Firefox when the GPU is out of
// VRAM — each freeze that day was an NVRM "Out of memory [NV_ERR_NO_MEMORY]" burst in the kernel
// log (llama-server 4.4 GB + iacore 1.7 GB with yolo11x, of 8). Not this code's fault: the fix
// is VRAM headroom (.claude/roadmap/PLATAFORMA.md). Without fullscreen, drop enterScreen() from
// the callers; the in-page expansion works on its own.

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
