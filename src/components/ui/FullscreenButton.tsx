import { IconMaximize } from "@tabler/icons-react";

/**
 * Small overlay button that toggles native fullscreen on the element referenced
 * by `targetRef`. Shared by every video stage (own camera, robot camera, monitor
 * mirror) so fullscreen behaves identically everywhere. Position it inside a
 * `relative` container — it pins itself to the top-right corner.
 */
export function FullscreenButton<T extends HTMLElement>({
  targetRef,
}: {
  targetRef: React.RefObject<T | null>;
}) {
  const toggle = () => {
    const el = targetRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      el.requestFullscreen?.();
    }
  };
  return (
    <button
      type="button"
      onClick={toggle}
      title="Fullscreen"
      aria-label="Toggle fullscreen"
      className="absolute right-2 top-2 z-10 flex items-center justify-center rounded bg-black/50 p-1.5 text-white hover:bg-black/70"
    >
      <IconMaximize size={18} stroke={2} />
    </button>
  );
}
