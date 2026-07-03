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
  /** Visible rows before the list scrolls. */
  rows?: number;
}

/**
 * Toggle-list multi-select: each option is a full-width tappable row that
 * flips in/out of the selection. Works with a single tap/click on both mouse
 * and touch — unlike a native `<select multiple>`, which needs Ctrl/Cmd-click
 * and is unusable on phones.
 */
export function MultiSelect({
  options,
  selected,
  onSelectionChange,
  rows = 6,
}: MultiProps) {
  const toggle = (value: string) => {
    onSelectionChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  };

  return (
    <div
      role="listbox"
      aria-multiselectable
      className="w-full overflow-y-auto rounded-md border border-line bg-bg"
      style={{ maxHeight: `${rows * 2}rem` }}
    >
      {options.map((o) => {
        const isSelected = selected.includes(o);
        return (
          <button
            key={o}
            type="button"
            role="option"
            aria-selected={isSelected}
            onClick={() => toggle(o)}
            className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-fg transition-colors ${
              isSelected ? "bg-accent/15" : "hover:bg-line/40"
            }`}
          >
            <span
              className={`flex h-4 w-4 flex-none items-center justify-center rounded border text-[10px] leading-none ${
                isSelected
                  ? "border-accent bg-accent text-bg"
                  : "border-line bg-transparent text-transparent"
              }`}
            >
              ✓
            </span>
            <span className="truncate">{o}</span>
          </button>
        );
      })}
    </div>
  );
}
