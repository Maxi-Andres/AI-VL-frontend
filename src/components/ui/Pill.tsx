import type { ReactNode } from "react";

/** Meaning of a pill's color: something works / needs attention / is broken / is
 * simply not in use. Shared by every header badge so the palette stays consistent. */
export type PillTone = "good" | "warn" | "bad" | "idle";

const TONES: Record<PillTone, string> = {
  good: "bg-[#173a26] text-accent",
  warn: "bg-[#3a3320] text-[#ffd08a]",
  bad: "bg-[#3a2330] text-[#ff9aa6]",
  idle: "bg-[#2a2e3a] text-muted",
};

interface Props {
  tone: PillTone;
  /** Native tooltip with the detail behind the pill (why it is in this state). */
  title?: string;
  icon?: ReactNode;
  /** Show a small leading dot (pulsing when `tone` is "good"). */
  dot?: boolean;
  className?: string;
  children: ReactNode;
}

/** Compact status pill for the header. */
export function Pill({ tone, title, icon, dot, className = "", children }: Props) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${TONES[tone]} ${className}`}
    >
      {dot && (
        <span
          className={`h-1.5 w-1.5 rounded-full bg-current ${
            tone === "good" ? "animate-pulse" : ""
          }`}
        />
      )}
      {icon}
      {children}
    </span>
  );
}
