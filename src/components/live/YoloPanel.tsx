import { Field } from "../ui/Field";
import { MultiSelect, Select } from "../ui/Select";

const IMG_SIZES = ["320", "640", "960", "1280"];

interface Props {
  models: string[];
  classOptions: string[];
  model: string;
  conf: number;
  imgsz: number;
  classes: string[];
  onModelChange: (v: string) => void;
  onConfChange: (v: number) => void;
  onImgszChange: (v: number) => void;
  onClassesChange: (v: string[]) => void;
}

/** Live YOLO controls: model, confidence, image size, class filter. */
export function YoloPanel({
  models,
  classOptions,
  model,
  conf,
  imgsz,
  classes,
  onModelChange,
  onConfChange,
  onImgszChange,
  onClassesChange,
}: Props) {
  return (
    <div>
      <h2 className="m-0 mb-2.5 text-[13px] font-semibold uppercase tracking-[0.04em] text-muted">
        YOLO (live)
      </h2>

      <Field label="Model">
        <Select
          options={models}
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
        />
      </Field>

      <Field label={<>conf <span className="text-fg">{conf.toFixed(2)}</span></>}>
        <input
          type="range"
          min={0.05}
          max={0.9}
          step={0.05}
          value={conf}
          onChange={(e) => onConfChange(parseFloat(e.target.value))}
          className="w-full"
        />
      </Field>

      <Field label="imgsz">
        <Select
          options={IMG_SIZES}
          value={String(imgsz)}
          onChange={(e) => onImgszChange(parseInt(e.target.value, 10))}
        />
      </Field>

      <Field
        label="Classes filter (empty = all)"
        hint="Ctrl/Cmd-click to select several. Empty = detect everything."
      >
        <MultiSelect
          options={classOptions}
          selected={classes}
          onSelectionChange={onClassesChange}
        />
      </Field>
    </div>
  );
}
