import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { MultiSelect, Select } from "../ui/Select";

const IMG_SIZES = ["320", "640", "960", "1280"];
const FPS_CAPS = ["Unlimited", "1", "2", "5", "10", "15", "30"];

interface Props {
  models: string[];
  classOptions: string[];
  model: string;
  conf: number;
  imgsz: number;
  classes: string[];
  /** Max frames/sec to send. 0 = unlimited. */
  maxFps: number;
  /** Master YOLO on/off (off = no detection runs, no GPU use). */
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  onModelChange: (v: string) => void;
  onConfChange: (v: number) => void;
  onImgszChange: (v: number) => void;
  onClassesChange: (v: string[]) => void;
  onMaxFpsChange: (v: number) => void;
}

/** Live YOLO controls: on/off switch, model, confidence, image size, class filter. */
export function YoloPanel({
  models,
  classOptions,
  model,
  conf,
  imgsz,
  classes,
  maxFps,
  enabled,
  onEnabledChange,
  onModelChange,
  onConfChange,
  onImgszChange,
  onClassesChange,
  onMaxFpsChange,
}: Props) {
  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h2 className="m-0 text-[13px] font-semibold uppercase tracking-[0.04em] text-muted">
          YOLO (live)
        </h2>
        <Button
          variant={enabled ? "primary" : "secondary"}
          className="px-2 py-1 text-[11px]"
          aria-pressed={enabled}
          title="Run YOLO detection on the current video. Off = no detection anywhere, so the GPU stays idle."
          onClick={() => onEnabledChange(!enabled)}
        >
          {enabled ? "On" : "Off"}
        </Button>
      </div>

      <Field label="Model">
        <Select
          options={models}
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
        />
      </Field>

      <Field
        label={<>conf <span className="text-fg">{conf.toFixed(2)}</span></>}
        inline
      >
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

      <Field label="imgsz" inline>
        <Select
          options={IMG_SIZES}
          value={String(imgsz)}
          onChange={(e) => onImgszChange(parseInt(e.target.value, 10))}
        />
      </Field>

      <Field
        label="Max FPS"
        hint="Cap the frames/sec sent to save CPU/bandwidth."
        inline
      >
        <Select
          options={FPS_CAPS}
          value={maxFps > 0 ? String(maxFps) : "Unlimited"}
          onChange={(e) =>
            onMaxFpsChange(
              e.target.value === "Unlimited" ? 0 : parseInt(e.target.value, 10),
            )
          }
        />
      </Field>

      <Field
        label="Classes filter (empty = all)"
        hint="Tap to toggle each class. Empty = detect everything."
      >
        <MultiSelect
          options={classOptions}
          selected={classes}
          onSelectionChange={onClassesChange}
          rows={3}
        />
      </Field>
    </div>
  );
}
