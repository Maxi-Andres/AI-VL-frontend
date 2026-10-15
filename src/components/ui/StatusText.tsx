import {
  IconAlertTriangle,
  IconBan,
  IconCheck,
  IconLoader2,
  IconPlayerStopFilled,
  IconX,
} from "@tabler/icons-react";

/** What a status line means, independent of its wording. The tone picks the icon,
 * so every screen marks "blocked" or "failed" with the same glyph. */
export type StatusTone = "ok" | "error" | "blocked" | "stopped" | "busy" | "warn";

/** A status message: the tone drives the icon, the text is shown as-is. */
export interface Status {
  tone: StatusTone;
  text: string;
}

const ICONS: Record<StatusTone, typeof IconCheck> = {
  ok: IconCheck,
  error: IconX,
  blocked: IconBan,
  stopped: IconPlayerStopFilled,
  busy: IconLoader2,
  warn: IconAlertTriangle,
};

interface Props {
  status: Status | null;
  /** Extra classes for the wrapper (colour, truncation, spacing per screen). */
  className?: string;
  size?: number;
  /** Wrap long text onto more lines instead of cutting it with "…". For side panels, where a
   * one-line message wider than the panel widened the whole column (Joints page, 2026-10-15). */
  wrap?: boolean;
}

/**
 * One-line status with a leading Tabler icon. Renders nothing when there is no
 * status, so callers can drop it straight into JSX without guarding.
 */
export function StatusText({ status, className = "", size = 13, wrap = false }: Props) {
  if (!status) return null;
  const Icon = ICONS[status.tone];
  return (
    <span className={`${wrap ? "flex items-start" : "inline-flex items-center"} min-w-0 gap-1 ${className}`}>
      <Icon
        size={size}
        stroke={2}
        className={`shrink-0 ${wrap ? "mt-[2px]" : ""} ${status.tone === "busy" ? "animate-spin" : ""}`}
      />
      <span className={wrap ? "min-w-0 break-words" : "truncate"}>{status.text}</span>
    </span>
  );
}
