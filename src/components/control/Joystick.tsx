import { useCallback, useRef, useState } from "react";

interface Props {
  label: string;
  /** "both" = full 2-axis; "x" = horizontal only (the rotate stick). */
  axis?: "both" | "x";
  /** Normalized knob position while dragging: x right = +1, y up = +1; (0,0) at rest. */
  onChange: (x: number, y: number) => void;
}

const SIZE = 132; // base diameter (px)
const KNOB = 54; // knob diameter (px)
const R = (SIZE - KNOB) / 2; // max knob travel from center

/**
 * Touch/pointer joystick for the drive pad. Reports a normalized vector while the
 * finger is down and snaps back to (0,0) on release. `touch-none` stops the page
 * from scrolling under the thumb. Shown only on touch devices (desktop uses keys).
 */
export function Joystick({ label, axis = "both", onChange }: Props) {
  const baseRef = useRef<HTMLDivElement>(null);
  const activeId = useRef<number | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 }); // knob pixel offset from center

  const move = useCallback(
    (clientX: number, clientY: number) => {
      const base = baseRef.current;
      if (!base) return;
      const rect = base.getBoundingClientRect();
      let dx = clientX - (rect.left + rect.width / 2);
      let dy = clientY - (rect.top + rect.height / 2);
      if (axis === "x") dy = 0;
      const dist = Math.hypot(dx, dy);
      if (dist > R) {
        dx = (dx / dist) * R;
        dy = (dy / dist) * R;
      }
      setPos({ x: dx, y: dy });
      onChange(dx / R, -dy / R); // invert y so pushing up is +1
    },
    [axis, onChange],
  );

  const end = useCallback(() => {
    activeId.current = null;
    setPos({ x: 0, y: 0 });
    onChange(0, 0);
  }, [onChange]);

  return (
    <div
      ref={baseRef}
      onPointerDown={(e) => {
        activeId.current = e.pointerId;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        move(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (activeId.current === e.pointerId) move(e.clientX, e.clientY);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      className="relative touch-none select-none rounded-full border border-white/30 bg-black/40 backdrop-blur-sm"
      style={{ width: SIZE, height: SIZE }}
      role="slider"
      aria-label={label}
    >
      <div
        className="pointer-events-none absolute rounded-full bg-white/70 shadow"
        style={{
          width: KNOB,
          height: KNOB,
          left: (SIZE - KNOB) / 2 + pos.x,
          top: (SIZE - KNOB) / 2 + pos.y,
        }}
      />
      <span className="pointer-events-none absolute inset-x-0 bottom-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-white/60">
        {label}
      </span>
    </div>
  );
}
