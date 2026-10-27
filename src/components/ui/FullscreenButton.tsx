import { useEffect, useState } from "react";
import { IconMaximize, IconMinimize } from "@tabler/icons-react";
import { useT } from "../../i18n";

/**
 * Small overlay button that makes the element referenced by `targetRef` fill the browser
 * window, and back (Esc too). Shared by every video stage (own camera, robot camera, monitor
 * mirror) so it behaves identically everywhere. Position it inside a `relative` container —
 * it pins itself to the top-right corner.
 *
 * Not the Fullscreen API on purpose: entering and leaving native fullscreen froze the whole
 * of Firefox on this GNOME + NVIDIA desktop. See `.stage-expanded` in index.css.
 */
export function FullscreenButton<T extends HTMLElement>({
  targetRef,
}: {
  targetRef: React.RefObject<T | null>;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;
    el.classList.toggle("stage-expanded", expanded);
    if (!expanded) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("keydown", esc);
      el.classList.remove("stage-expanded");
    };
  }, [expanded, targetRef]);

  return (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      title={expanded ? t("Leave fullscreen (Esc)") : t("Fullscreen")}
      aria-label={t("Toggle fullscreen")}
      aria-pressed={expanded}
      className="on-video absolute top-3 right-3 z-10 grid size-9 cursor-pointer place-items-center rounded-lg transition duration-100 active:scale-90"
    >
      {expanded ? <IconMinimize size={18} stroke={2} /> : <IconMaximize size={18} stroke={2} />}
    </button>
  );
}
