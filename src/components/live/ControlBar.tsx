import { Button } from "../ui/Button";

interface Props {
  active: boolean;
  fps: string;
  count: string;
  onStart: () => void;
  onStop: () => void;
}

/** Start/Stop controls plus the per-frame metrics. */
export function ControlBar({ active, fps, count, onStart, onStop }: Props) {
  return (
    <div className="mt-2.5 flex items-center gap-2.5">
      <Button onClick={onStart} disabled={active}>
        Start camera
      </Button>
      <Button variant="secondary" onClick={onStop} disabled={!active}>
        Stop
      </Button>
      <span className="text-muted tabular-nums">{fps}</span>
      <span className="text-muted tabular-nums">{count}</span>
    </div>
  );
}
