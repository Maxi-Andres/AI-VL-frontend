import { useEffect, useRef } from "react";
import { Button } from "../ui/Button";
import { FullscreenButton } from "../ui/FullscreenButton";
import { drawBoxes } from "../../lib/draw";
import type { DetectedObject } from "../../types";

interface Props {
  /** Latest robot-camera JPEG as a data URL (empty until the first frame). */
  frameUrl: string;
  connected: boolean;
  /** Detection boxes for the current frame (empty when YOLO is off). */
  objects: DetectedObject[];
  /** Switch back to this device's own camera. */
  onExit: () => void;
}

/**
 * Shows the robot camera feed on the Live page (when the device is acting as a
 * remote monitor instead of using its own webcam). Renders the frame, a YOLO
 * overlay (only populated when detection is on), and a control to go back to the
 * own camera. The canvas tracks the frame's native size and uses the same
 * object-contain CSS, so normalized bboxes stay aligned.
 */
export function RobotCameraStage({ frameUrl, connected, objects, onExit }: Props) {
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
    drawBoxes(canvas, objects);
  };
  useEffect(redraw, [objects, frameUrl]);

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
            {connected ? "Waiting for the robot camera…" : "Connecting…"}
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
        />
        <FullscreenButton targetRef={wrapRef} />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
        <Button variant="secondary" onClick={onExit}>
          Use my camera
        </Button>
        <span className="text-xs text-muted">
          Robot camera {connected ? "· live" : "· connecting"}
        </span>
      </div>
    </section>
  );
}
