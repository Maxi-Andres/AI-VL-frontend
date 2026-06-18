import type { ReactNode } from "react";

interface Props {
  label: ReactNode;
  hint?: string;
  children: ReactNode;
}

/** Labelled form row with an optional hint line. */
export function Field({ label, hint, children }: Props) {
  return (
    <label className="mb-2.5 block text-xs text-muted">
      <span className="mb-1 block">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}
