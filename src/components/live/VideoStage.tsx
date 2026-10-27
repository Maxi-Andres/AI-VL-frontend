import { useRef } from "react";
import type { ReactNode } from "react";
import { DetectionOverlay } from "./DetectionOverlay";
import { FullscreenButton } from "../ui/FullscreenButton";
import type { DetectedObject } from "../../types";

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  objects: DetectedObject[];
  /** Force one box color (VLM overlay); omit for per-class YOLO colors. */
  overrideColor?: string;
  /** Drawn over the picture: state chips, the camera's start/stop/flip. */
  overlay?: ReactNode;
}

/** The video viewport for this device's own camera: <video> + detection overlay +
 * fullscreen, filling the column it sits in. The controls are the page's `overlay`. */
export function VideoStage({ videoRef, objects, overrideColor, overlay }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        ref={wrapRef}
        className="video-stage relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-black shadow-lift lg:aspect-auto lg:min-h-[260px] lg:flex-1"
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
        {overlay}
        <FullscreenButton targetRef={wrapRef} />
      </div>
    </section>
  );
}
