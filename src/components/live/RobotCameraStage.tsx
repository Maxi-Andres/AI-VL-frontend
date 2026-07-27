import { useEffect, useRef } from "react";
import { FullscreenButton } from "../ui/FullscreenButton";
import { drawBoxes } from "../../lib/draw";
import type { DetectedObject } from "../../types";

interface Props {
  /** Latest frame as an object-URL (empty until the first frame). */
  frameUrl: string;
  connected: boolean;
  /** Boxes to draw (live detections, or a VLM overlay). */
  objects: DetectedObject[];
  /** Force one color for all boxes (VLM overlay); omit for per-class colors. */
  overrideColor?: string;
  /** Caption shown under the video (e.g. "Robot camera" / "Session mirror"). */
  label?: string;
}

/**
 * Read-only video stage for a fanned-out source (robot camera or a session
 * mirror). Renders the frame, a YOLO/VLM overlay, and a fullscreen button. The
 * canvas tracks the frame's native size and uses the same object-contain CSS, so
 * normalized bboxes stay aligned. The camera-source picker lives on the page.
 */
export function RobotCameraStage({
  frameUrl,
  connected,
  objects,
  overrideColor,
  label = "Robot camera",
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const img = imgRef.current;
    const w = img?.naturalWidth || 1280;
    const h = img?.naturalHeight || 960;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    drawBoxes(canvas, objects, overrideColor);
  };
  useEffect(redraw, [objects, overrideColor, frameUrl]);

  return (
    <section className="min-w-0">
      <div
        ref={wrapRef}
        className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-line bg-black"
      >
        {frameUrl ? (
          // eslint-disable-next-line jsx-a11y/alt-text
          <img
            ref={imgRef}
            src={frameUrl}
            alt=""
            onLoad={redraw}
            className="absolute inset-0 h-full w-full object-contain"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
            {connected ? "Waiting for frames…" : "Connecting…"}
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
        />
        <FullscreenButton targetRef={wrapRef} />
      </div>

      <div className="mt-2.5 text-xs text-muted">
        {label} {connected ? "· live" : "· connecting"}
      </div>
    </section>
  );
}
