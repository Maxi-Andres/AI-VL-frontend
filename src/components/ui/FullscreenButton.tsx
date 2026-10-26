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
      className="absolute top-3 right-3 z-10 grid size-9 cursor-pointer place-items-center rounded-lg bg-black/55 text-white backdrop-blur transition duration-100 hover:bg-black/75 active:scale-90"
    >
      <IconMaximize size={18} stroke={2} />
    </button>
  );
}
