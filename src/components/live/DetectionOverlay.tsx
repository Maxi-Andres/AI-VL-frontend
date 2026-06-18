import { useEffect, useRef } from "react";
import { drawBoxes } from "../../lib/draw";
import type { DetectedObject } from "../../types";

interface Props {
  objects: DetectedObject[];
  color: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

/**
 * Transparent canvas layered over the <video>, redrawing boxes whenever the
 * objects (or color) change. Its intrinsic size tracks the video so normalized
 * bbox coords map correctly; CSS stretches it to fill the wrapper.
 */
export function DetectionOverlay({ objects, color, videoRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const video = videoRef.current;
    const w = video?.videoWidth || 1280;
    const h = video?.videoHeight || 720;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    drawBoxes(canvas, objects, color);
  }, [objects, color, videoRef]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
