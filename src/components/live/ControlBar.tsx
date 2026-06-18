import { Button } from "../ui/Button";
import type { Facing } from "../../hooks/useCamera";

interface Props {
  active: boolean;
  facing: Facing;
  fps: string;
  count: string;
  onStart: () => void;
  onStop: () => void;
  onFlip: () => void;
}

/** Start/Stop/Flip controls plus the per-frame metrics. */
export function ControlBar({
  active,
  facing,
  fps,
  count,
  onStart,
  onStop,
  onFlip,
}: Props) {
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
      <Button onClick={onStart} disabled={active}>
        Start camera
      </Button>
      <Button variant="secondary" onClick={onStop} disabled={!active}>
        Stop
      </Button>
      <Button variant="secondary" onClick={onFlip} title="Switch front/rear camera">
        {facing === "environment" ? "Rear cam" : "Front cam"} · flip
      </Button>
      <span className="text-muted tabular-nums">{fps}</span>
      <span className="text-muted tabular-nums">{count}</span>
    </div>
  );
}
