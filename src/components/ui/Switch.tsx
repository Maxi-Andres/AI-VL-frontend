/** An on/off switch: a track and a knob that slides (with a little overshoot) between them. */
export function Switch({ on, onChange, label, disabled = false }: {
  on: boolean; onChange: (on: boolean) => void; label: string; disabled?: boolean;
}) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-5 w-[34px] shrink-0 cursor-pointer rounded-full transition-colors duration-200 disabled:cursor-default disabled:opacity-50 ${on ? "bg-accent" : "bg-line"}`}>
      <span className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.25)] transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1.2)] ${on ? "translate-x-[14px]" : ""}`} />
    </button>
  );
}
