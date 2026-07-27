// Grab the current video frame as a JPEG data URL (used by the VLM request).
//
// `maxSize` caps the longer side (px) before encoding: a smaller frame means far
// fewer image tokens for the VLM, so the answer comes back sooner. 0 keeps the
// native resolution. `quality` is the JPEG quality (0..1).
export function captureFrame(
  video: HTMLVideoElement,
  quality = 0.85,
  maxSize = 0,
): string | null {
  if (!video.videoWidth) return null;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const scale = maxSize > 0 ? Math.min(1, maxSize / Math.max(vw, vh)) : 1;
  const w = Math.max(1, Math.round(vw * scale));
  const h = Math.max(1, Math.round(vh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}
