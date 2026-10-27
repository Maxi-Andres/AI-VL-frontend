import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

/**
 * A segmented control's track with ONE pill that slides to the chosen option, the way the
 * header's tab bar does — instead of each option lighting up on its own.
 *
 * The options are the caller's own buttons; the chosen one carries `data-on="true"`, and the
 * pill (panel colour, card shadow, the option's own corner radius) is measured off it — on
 * every change of choice, size or font. Options draw no background of their own when chosen.
 * `pill` swaps the pill's colours (e.g. a dark track).
 */
export function Segmented({ className = "", pill = "bg-panel shadow-card", children, ...rest }: {
  className?: string;
  pill?: string;
  children: ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  const track = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<CSSProperties | null>(null);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const el = track.current;
    if (!el) return;
    const measure = () => {
      const on = el.querySelector<HTMLElement>(':scope > [data-on="true"]');
      if (!on) return setBox(null);
      setBox({
        left: on.offsetLeft, top: on.offsetTop, width: on.offsetWidth, height: on.offsetHeight,
        borderRadius: getComputedStyle(on).borderRadius,
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const c of el.children) ro.observe(c);
    const mo = new MutationObserver(measure);
    mo.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-on"] });
    // The first placement appears in place; only later moves slide.
    const id = requestAnimationFrame(() => setReady(true));
    return () => {
      ro.disconnect();
      mo.disconnect();
      cancelAnimationFrame(id);
    };
  }, []);

  return (
    <div ref={track} {...rest} className={`relative isolate ${className}`}>
      {box && (
        <span aria-hidden style={box}
          className={`pointer-events-none absolute -z-10 ${pill} ${
            ready ? "transition-[left,top,width,height] duration-300 ease-[cubic-bezier(.2,.8,.2,1)]" : ""}`} />
      )}
      {children}
    </div>
  );
}
