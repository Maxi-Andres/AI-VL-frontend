import { DetectionOverlay } from "./DetectionOverlay";
import { ControlBar } from "./ControlBar";
import type { DetectedObject } from "../../types";
import type { Facing } from "../../hooks/useCamera";

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  objects: DetectedObject[];
  overlayColor: string;
  active: boolean;
  facing: Facing;
  fps: string;
  count: string;
  onStart: () => void;
  onStop: () => void;
  onFlip: () => void;
}

/** The video viewport: <video> + detection overlay + control bar. */
export function VideoStage({
  videoRef,
  objects,
  overlayColor,
  active,
  facing,
  fps,
  count,
  onStart,
  onStop,
  onFlip,
}: Props) {
  return (
    <section className="min-w-0">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-line bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-contain"
        />
        <DetectionOverlay
          objects={objects}
          color={overlayColor}
          videoRef={videoRef}
        />
      </div>
      <ControlBar
        active={active}
        facing={facing}
        fps={fps}
        count={count}
        onStart={onStart}
        onStop={onStop}
        onFlip={onFlip}
      />
    </section>
  );
}
