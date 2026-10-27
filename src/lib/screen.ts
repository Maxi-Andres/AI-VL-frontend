// The browser's own fullscreen, for the WHOLE page — under a video stage that already fills
// the window (.stage-expanded), so the picture also covers the tabs and the address bar.
// Requested for <html>, never for the stage: the stage keeps its in-page expansion either
// way, and if the browser refuses or fails, that expansion is still there.
//
// NOT CALLED for now. On the GNOME + NVIDIA desktop this runs on, the switch into native
// fullscreen froze the whole of Firefox, three times on 2026-10-27 — each one an NVRM
// "Out of memory [NV_ERR_NO_MEMORY]" burst in the kernel log: the GPU had no VRAM left for the
// new full-screen surface (llama-server 4.4 GB + iacore 1.7 GB of 8). The page-filling layer
// asks the GPU for nothing new. Call enterScreen()/onScreenLeft() again from FullscreenButton and
// the Drive cockpit once that machine has the headroom.

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
