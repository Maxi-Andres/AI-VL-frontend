import { DetectionOverlay } from "./DetectionOverlay";
import { ControlBar } from "./ControlBar";
import type { DetectedObject } from "../../types";

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  objects: DetectedObject[];
  overlayColor: string;
  active: boolean;
  fps: string;
  count: string;
  onStart: () => void;
  onStop: () => void;
}

/** The video viewport: <video> + detection overlay + control bar. */
export function VideoStage({
  videoRef,
  objects,
  overlayColor,
  active,
  fps,
  count,
  onStart,
  onStop,
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
        fps={fps}
        count={count}
        onStart={onStart}
        onStop={onStop}
      />
    </section>
  );
}
