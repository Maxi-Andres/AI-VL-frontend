import { useCallback, useState } from "react";
import { CollapsibleColumn } from "./CollapsibleColumn";

export interface StageColumn {
  /** Stable id; also the localStorage key suffix for this column's state. */
  key: string;
  /** Short label for the collapsed bar. */
  title: string;
  node: React.ReactNode;
}

/**
 * Shared layout for the Live and Monitor pages: three collapsible control columns
 * beside the video stage. On desktop the columns sit to the LEFT and the video
 * fills the rest — so collapsing columns makes the video bigger. On narrow
 * screens everything stacks (video on top, columns below). Each column's
 * collapsed state is remembered per browser; they start collapsed so the video
 * is as large as possible until the user opens what they need.
 */
export function ControlsStageLayout({
  columns,
  children,
}: {
  columns: StageColumn[];
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const c of columns) {
      const saved =
        typeof localStorage !== "undefined"
          ? localStorage.getItem(`aivl.col.${c.key}`)
          : null;
      init[c.key] = saved === null ? true : saved === "1"; // default: collapsed
    }
    return init;
  });

  const toggle = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (typeof localStorage !== "undefined")
        localStorage.setItem(`aivl.col.${key}`, next[key] ? "1" : "0");
      return next;
    });
  }, []);

  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:items-start">
      {/* Video/stage: on top on mobile, on the LEFT on desktop — it grows to fill
          whatever space the collapsed columns free up. */}
      <div className="order-1 min-w-0 flex-1 lg:order-1">{children}</div>
      {/* The three collapsible control columns, RIGHT of the video on desktop. */}
      <div className="order-2 flex flex-col gap-2 lg:order-2 lg:flex-row lg:items-start">
        {columns.map((c) => (
          <CollapsibleColumn
            key={c.key}
            title={c.title}
            collapsed={!!collapsed[c.key]}
            onToggle={() => toggle(c.key)}
          >
            {c.node}
          </CollapsibleColumn>
        ))}
      </div>
    </div>
  );
}
