import { IconMaximize } from "@tabler/icons-react";
import { useRef } from "react";
import { DetectionOverlay } from "./DetectionOverlay";
import { ControlBar } from "./ControlBar";
import type { DetectedObject } from "../../types";
import type { Facing } from "../../hooks/useCamera";

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  objects: DetectedObject[];
  /** Force one box color (VLM overlay); omit for per-class YOLO colors. */
  overrideColor?: string;
  active: boolean;
  facing: Facing;
  fps: string;
  count: string;
  onStart: () => void;
  onStop: () => void;
  onFlip: () => void;
}

/** The video viewport: <video> + detection overlay + fullscreen + control bar. */
export function VideoStage({
  videoRef,
  objects,
  overrideColor,
  active,
  facing,
  fps,
  count,
  onStart,
  onStop,
  onFlip,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);

  const toggleFullscreen = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      el.requestFullscreen?.();
    }
  };

  return (
    <section className="min-w-0">
      <div
        ref={wrapRef}
        className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-line bg-black"
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-contain"
        />
        <DetectionOverlay
          objects={objects}
          overrideColor={overrideColor}
          videoRef={videoRef}
        />
        <button
          type="button"
          onClick={toggleFullscreen}
          title="Fullscreen"
          aria-label="Toggle fullscreen"
          className="absolute right-2 top-2 flex items-center justify-center rounded bg-black/50 p-1.5 text-white hover:bg-black/70"
        >
          <IconMaximize size={18} stroke={2} />
        </button>
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
