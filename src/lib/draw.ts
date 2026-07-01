// Canvas drawing helpers for the detection overlay. Coordinates in DetectedObject
// are normalized 0..1, so they are scaled by the canvas' intrinsic size (which is
// set to the video's native resolution). The canvas uses the SAME object-contain
// CSS as the <video>, so both letterbox identically and the boxes stay aligned
// regardless of the camera's aspect ratio.
import type { DetectedObject } from "../types";

// Ultralytics' default color palette (RGB hex), indexed by class id — the exact
// colors YOLO draws boxes with (ultralytics/utils/plotting.py `Colors`).
const YOLO_PALETTE = [
  "#FF3838", "#FF9D97", "#FF701F", "#FFB21D", "#CFD231", "#48F90A", "#92CC17",
  "#3DDB86", "#1A9334", "#00D4BB", "#2C99A8", "#00C2FF", "#344593", "#6473FF",
  "#0018EC", "#8438FF", "#520085", "#CB38FF", "#FF95C8", "#FF37C7",
];

// Stable fallback when there is no class id (e.g. VLM objects): hash the type
// string into the palette so each category still gets its own consistent color.
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** The YOLO-palette color for an object (by class id, else by type-name hash). */
export function colorForObject(o: DetectedObject): string {
  const idx = o.class_id != null ? o.class_id : hashString(o.type || "");
  return YOLO_PALETTE[idx % YOLO_PALETTE.length];
}

/** Pick black/white label text for contrast against the box color. */
function textColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 > 140 ? "#000000" : "#FFFFFF";
}

export function drawBoxes(
  canvas: HTMLCanvasElement,
  objects: DetectedObject[],
  // Force one color for every box (used for the VLM overlay). When omitted, each
  // box is colored by its class with the YOLO palette.
  overrideColor?: string,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineWidth = Math.max(2, canvas.width / 480);
  ctx.font = `${Math.max(12, canvas.width / 70)}px system-ui, sans-serif`;
  ctx.textBaseline = "top";

  for (const o of objects) {
    const color = overrideColor ?? colorForObject(o);
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
    ctx.fillStyle = textColor(color);
    ctx.fillText(label, x + 4, Math.max(0, y - th) + 3);
  }
}

export function clearCanvas(canvas: HTMLCanvasElement): void {
  canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
}
