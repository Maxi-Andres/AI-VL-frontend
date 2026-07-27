import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";

interface Props {
  /** Short label shown on the collapsed bar (the panel keeps its own heading). */
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

/**
 * One control column that the user can collapse to reclaim space for the video.
 * Collapsed it becomes a thin bar (a full-width header on mobile, a narrow
 * vertical strip on desktop); expanded it shows the panel as-is with a small
 * collapse button pinned to the top-right corner (so the panel's own heading
 * stays the visible title — no duplication).
 */
export function CollapsibleColumn({ title, collapsed, onToggle, children }: Props) {
  if (collapsed) {
    return (
      <div className="shrink-0 rounded-lg border border-line bg-panel lg:w-9 lg:self-start">
        <button
          type="button"
          onClick={onToggle}
          title={`Expand ${title}`}
          aria-expanded={false}
          className="flex w-full items-center gap-2 px-3 py-2 text-[13px] font-semibold uppercase tracking-[0.04em] text-muted hover:text-fg lg:w-9 lg:flex-col lg:gap-3 lg:px-0 lg:py-3"
        >
          <IconChevronRight size={16} stroke={2} className="shrink-0" />
          <span className="lg:[writing-mode:vertical-rl]">{title}</span>
        </button>
      </div>
    );
  }
  return (
    <div className="min-w-0 shrink-0 rounded-lg border border-line bg-panel lg:w-[320px]">
      {/* Collapse control on its own row so it never overlaps the panel heading. */}
      <div className="flex justify-end px-2 pt-2">
        <button
          type="button"
          onClick={onToggle}
          title={`Collapse ${title}`}
          aria-expanded
          aria-label={`Collapse ${title}`}
          className="rounded p-1 text-muted hover:bg-white/5 hover:text-fg"
        >
          <IconChevronLeft size={16} stroke={2} />
        </button>
      </div>
      <div className="px-2.5 pb-2.5">{children}</div>
    </div>
  );
}
