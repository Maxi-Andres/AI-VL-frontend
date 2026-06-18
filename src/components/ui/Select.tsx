import type { SelectHTMLAttributes } from "react";

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  options: string[];
}

const base =
  "w-full rounded-md border border-line bg-bg p-1.5 text-fg focus:border-accent focus:outline-none";

export function Select({ options, className = "", ...props }: Props) {
  return (
    <select className={`${base} ${className}`} {...props}>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

interface MultiProps {
  options: string[];
  selected: string[];
  onSelectionChange: (values: string[]) => void;
  size?: number;
}

/** Native multi-select (Ctrl/Cmd-click to pick several). */
export function MultiSelect({
  options,
  selected,
  onSelectionChange,
  size = 6,
}: MultiProps) {
  return (
    <select
      multiple
      size={size}
      value={selected}
      onChange={(e) =>
        onSelectionChange([...e.target.selectedOptions].map((o) => o.value))
      }
      className={base}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
