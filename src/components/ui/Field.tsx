import type { ReactNode } from "react";

interface Props {
  label: ReactNode;
  hint?: string;
  children: ReactNode;
  /** Put the label and the control on the same row (label left, control right)
   * to save vertical space. Best for a compact control like a small Select. */
  inline?: boolean;
}

/** Labelled form row with an optional hint line. */
export function Field({ label, hint, children, inline = false }: Props) {
  if (inline) {
    return (
      <label className="mb-2.5 block text-xs text-muted">
        <span className="flex items-center gap-2">
          <span className="shrink-0">{label}</span>
          <span className="ml-auto w-1/2 min-w-0">{children}</span>
        </span>
        {hint && (
          <span className="mt-1 block text-[11px] text-muted">{hint}</span>
        )}
      </label>
    );
  }
  return (
    <label className="mb-2.5 block text-xs text-muted">
      <span className="mb-1 block">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}
