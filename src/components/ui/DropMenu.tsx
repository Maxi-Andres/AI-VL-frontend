import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";

// The header's dropdowns (you, services, robot) open and close the same way: a fade with a
// small drop and a 98% → 100% scale from the corner they hang from. The panel stays mounted
// so closing animates too; `inert` keeps a closed one out of the tab order and clicks.

/** Open state that closes on a click outside `ref` or on Escape. */
export function useDropdown(): { open: boolean; setOpen: (v: boolean | ((o: boolean) => boolean)) => void; ref: RefObject<HTMLDivElement | null> } {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return { open, setOpen, ref };
}

export function DropMenu({ open, className = "", children }: { open: boolean; className?: string; children: ReactNode }) {
  return (
    <div inert={!open}
      className={`absolute right-0 z-50 origin-top-right rounded-[14px] border border-line bg-panel p-1.5 text-left shadow-lift transition duration-200 ease-out ${
        open ? "translate-y-0 scale-100 opacity-100" : "pointer-events-none -translate-y-1.5 scale-[.98] opacity-0"} ${className}`}>
      {children}
    </div>
  );
}
