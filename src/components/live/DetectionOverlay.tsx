import { useEffect, useRef } from "react";
import { drawBoxes } from "../../lib/draw";
import type { DetectedObject } from "../../types";

interface Props {
  objects: DetectedObject[];
  /** Force one color for all boxes (VLM overlay). Omit for per-class YOLO colors. */
  overrideColor?: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

/**
 * Transparent canvas layered over the <video>, redrawing boxes whenever the
 * objects (or color) change. Its intrinsic size tracks the video's native
 * resolution and it uses the SAME `object-contain` CSS as the video, so both
 * letterbox identically and normalized bbox coords stay aligned for any camera
 * aspect ratio.
 */
export function DetectionOverlay({ objects, overrideColor, videoRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const video = videoRef.current;
    const w = video?.videoWidth || 1280;
    const h = video?.videoHeight || 720;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    drawBoxes(canvas, objects, overrideColor);
  }, [objects, overrideColor, videoRef]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full object-contain"
    />
  );
}
