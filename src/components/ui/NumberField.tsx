import type { InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> & {
  value: number;
  onValueChange: (v: number) => void;
};

/**
 * A small numeric input, styled like every other control in the app.
 *
 * WHY IT EXISTS: this exact class string was copy-pasted into four places
 * (`NetworkControls`, `ActionPad`, `ControlPage`, and as `selCls` in `CameraControls`).
 * Three copies is the project's hard limit, so the fifth was not written — this is it.
 * The other four are not migrated here; that is a separate, mechanical change.
 *
 * It reports a NUMBER, not a string: every call site was doing its own `parseFloat` and
 * an empty field silently became `NaN`, which then travelled into a request body.
 */
export function NumberField({ value, onValueChange, className = "", ...rest }: Props) {
  return (
    <input
      type="number"
      value={Number.isFinite(value) ? value : ""}
      onChange={(e) => {
        const n = parseFloat(e.target.value);
        // An empty or half-typed field must not emit NaN downstream; hold the last good
        // value until the user types something parseable.
        if (Number.isFinite(n)) onValueChange(n);
      }}
      className={
        "w-20 rounded-md border border-line bg-bg px-1.5 py-1 text-[11px] text-fg " +
        "focus:border-accent focus:outline-none " + className
      }
      {...rest}
    />
  );
}
