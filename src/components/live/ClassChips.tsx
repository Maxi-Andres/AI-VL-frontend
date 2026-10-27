/** What detection sees, one chip per class — on ONE line of fixed height that scrolls sideways
 * when it does not fit (faded at the edge), so a new class never adds a row and moves the video
 * or the panel under it. The caller sorts (most first, then by name) so chips keep their place
 * from frame to frame instead of swapping with every detection. */
export function ClassChips({ classes, className = "" }: {
  classes: { label: string; n: number; color: string }[];
  className?: string;
}) {
  return (
    <div className={`flex h-[26px] min-w-0 items-center gap-1.5 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [mask-image:linear-gradient(to_right,#000_calc(100%-24px),transparent)] ${className}`}>
      {classes.map((c) => (
        <span key={c.label} className="flex shrink-0 items-center gap-1.5 rounded-full bg-subtle px-2.5 py-1 text-xs font-bold whitespace-nowrap">
          <span className="size-2 rounded-sm" style={{ background: c.color }} />
          {c.label}<span className="text-muted">×{c.n}</span>
        </span>
      ))}
    </div>
  );
}
