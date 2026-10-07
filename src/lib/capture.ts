// Grab what a <video> or <canvas> is showing, for the VLM and for browser-side YOLO pairing.
//
// ONE place that knows how to read "the picture on screen" off either element, whichever
// transport painted it: a WebRTC <video>, the all-intra H.264 canvas, or a still held for
// pairing. PLAN_YOLO_FRAME_PAIRING.md §7: every consumer analyses the picture the operator is
// looking at, and two grab paths would drift the first time a third consumer appears.
//
// `maxSize` caps the longer side (px) before encoding: a smaller frame means far
// fewer image tokens for the VLM, so the answer comes back sooner. 0 keeps the
// native resolution. `quality` is the JPEG quality (0..1).

export type FrameSource = HTMLVideoElement | HTMLCanvasElement;

/** Native size of what the element shows, or null while it shows nothing yet. */
function nativeSize(src: FrameSource): [number, number] | null {
  const [w, h] = src instanceof HTMLVideoElement
    ? [src.videoWidth, src.videoHeight]
    : [src.width, src.height];
  return w && h ? [w, h] : null;
}

/** Draw `src` onto a new canvas, its longer side capped at `maxSize` (0 = native). */
function drawScaled(src: FrameSource, maxSize: number): HTMLCanvasElement | null {
  const size = nativeSize(src);
  if (!size) return null;
  const [vw, vh] = size;
  const scale = maxSize > 0 ? Math.min(1, maxSize / Math.max(vw, vh)) : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(vw * scale));
  canvas.height = Math.max(1, Math.round(vh * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** The current frame as a JPEG data URL (the VLM request). */
export function captureFrame(src: FrameSource, quality = 0.85, maxSize = 0): string | null {
  return drawScaled(src, maxSize)?.toDataURL("image/jpeg", quality) ?? null;
}

/** A native-size copy of the current frame: what gets SHOWN while its boxes are computed. */
export function snapshotFrame(src: FrameSource): HTMLCanvasElement | null {
  return drawScaled(src, 0);
}

/** A JPEG Blob of `src`, longer side capped at `maxSize` — what gets SENT for detection.
 *  Encoded from the snapshot itself, so what is shown and what is analysed cannot differ. */
export function encodeFrame(src: FrameSource, maxSize = 0, quality = 0.8): Promise<Blob | null> {
  const canvas = drawScaled(src, maxSize);
  if (!canvas) return Promise.resolve(null);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}
