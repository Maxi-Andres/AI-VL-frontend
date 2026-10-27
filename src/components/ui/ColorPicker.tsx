import { IconCheck } from "@tabler/icons-react";
import { COLORS, COLOR_LABEL, SOLID, type ColorName } from "../../lib/colors";
import { useT } from "../../i18n";

/** One swatch per palette colour; the chosen one carries a check. */
export function ColorPicker({ value, onChange, label }: {
  value: ColorName; onChange: (c: ColorName) => void; label?: string;
}) {
  const t = useT();
  return (
    <div role="radiogroup" aria-label={label ?? t("Colour")} className="flex flex-wrap gap-2">
      {COLORS.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={t(COLOR_LABEL[c])} title={t(COLOR_LABEL[c])}
          onClick={() => onChange(c)} style={{ background: SOLID[c] }}
          className={`grid size-7 cursor-pointer place-items-center rounded-full text-white transition hover:scale-110 ${
            value === c ? "ring-2 ring-fg ring-offset-2 ring-offset-panel" : ""}`}>
          {value === c && <IconCheck size={15} stroke={3} />}
        </button>
      ))}
    </div>
  );
}
