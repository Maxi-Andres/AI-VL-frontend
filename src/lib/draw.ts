// Canvas drawing helpers for the detection overlay. Coordinates in DetectedObject
// are normalized 0..1, so they are scaled by the canvas' intrinsic size.
import type { DetectedObject } from "../types";

export function drawBoxes(
  canvas: HTMLCanvasElement,
  objects: DetectedObject[],
  color = "#4ade80",
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineWidth = Math.max(2, canvas.width / 480);
  ctx.font = `${Math.max(12, canvas.width / 70)}px system-ui, sans-serif`;
  ctx.textBaseline = "top";

  for (const o of objects) {
    const [x1, y1, x2, y2] = o.bbox;
    const x = x1 * canvas.width;
    const y = y1 * canvas.height;
    const w = (x2 - x1) * canvas.width;
    const h = (y2 - y1) * canvas.height;

    ctx.strokeStyle = color;
    ctx.strokeRect(x, y, w, h);

    const label = `${o.type}${
      o.confidence != null ? " " + Math.round(o.confidence * 100) + "%" : ""
    }`;
    const tw = ctx.measureText(label).width + 8;
    const th = parseInt(ctx.font, 10) + 6;
    ctx.fillStyle = color;
    ctx.fillRect(x, Math.max(0, y - th), tw, th);
    ctx.fillStyle = "#04140a";
    ctx.fillText(label, x + 4, Math.max(0, y - th) + 3);
  }
}

export function clearCanvas(canvas: HTMLCanvasElement): void {
  canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
}
