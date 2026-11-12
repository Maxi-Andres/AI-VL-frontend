import type { ReactNode } from "react";

/** A voice control with its name on it; green while on. */
export function Chip({ on, onClick, title, icon, label, disabled = false, pulse = false }: {
  on: boolean; onClick: () => void; title: string; icon: ReactNode; label: string;
  disabled?: boolean; pulse?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={on} title={title}
      className={`flex h-7 cursor-pointer items-center gap-1 rounded-lg px-2 text-[11.5px] font-bold transition duration-200 active:scale-95 disabled:cursor-default disabled:opacity-40 ${
        on ? `${pulse ? "animate-pulse bg-bad-bg text-bad-fg" : "bg-good-bg text-good-fg"}` : "text-muted hover:bg-subtle hover:text-fg disabled:hover:bg-transparent"}`}>
      {icon}<span className="whitespace-nowrap">{label}</span>
    </button>
  );
}
