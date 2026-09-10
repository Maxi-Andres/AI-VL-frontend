import { useEffect, useRef } from "react";

interface Props {
  /** Changes once per frame — the signal that a new frame is available. */
  frameUrl: string;
  /** The freshest JPEG, from the same hook that produced `frameUrl`. */
  getBlob: () => Blob | null;
  /** Called with the frame's native size when it changes (for an aligned overlay). */
  onSize?: (w: number, h: number) => void;
  className?: string;
}

/**
 * Paint the live camera into a canvas instead of swapping an `<img>`'s src.
 *
 * WHY, measured 2026-09-10: with `<img>` the drive view flashed black for a few
 * milliseconds at a time. Every frame replaces the element's source, and when the next
 * 1080p JPEG is not decoded in time there is nothing to paint — and the box behind it is
 * `bg-black`. It got noticeably worse the moment the robot's frame rate went from 4.4 to
 * 10.4 fps, because the swap simply happens more often.
 *
 * A canvas cannot do that: it keeps the last frame it drew until the next `drawImage()`
 * lands, so a slow decode shows a slightly stale frame instead of a hole. For someone
 * steering, stale beats blank every time.
 *
 * Two things come for free. `createImageBitmap()` decodes OFF the main thread, so a 165 KB
 * 1080p JPEG ten times a second stops competing with input handling; and the
 * `createObjectURL`/`revokeObjectURL` pair per frame disappears from the paint path.
 */
export function CameraCanvas({ frameUrl, getBlob, onSize, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  // Through a ref so an inline callback at the call site does not put a new identity in
  // the effect's deps ten times a second and redraw every frame twice.
  const onSizeRef = useRef(onSize);
  onSizeRef.current = onSize;

  useEffect(() => {
    if (!frameUrl) return;
    const blob = getBlob();
    if (!blob) return;

    let cancelled = false;
    createImageBitmap(blob)
      .then((bmp) => {
        // A newer frame already arrived, or we unmounted: drop this one rather than
        // painting it out of order. Bitmaps hold decoded pixels, so always close().
        const canvas = canvasRef.current;
        if (cancelled || !canvas) {
          bmp.close();
          return;
        }
        // Only touch width/height when the source size actually changes — assigning
        // either one clears the canvas, which would reintroduce the very flash this
        // component exists to remove.
        // Read the size BEFORE close(): a closed ImageBitmap reports 0x0.
        const { width, height } = bmp;
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        canvas.getContext("2d")?.drawImage(bmp, 0, 0);
        bmp.close();
        if (width !== sizeRef.current.w || height !== sizeRef.current.h) {
          sizeRef.current = { w: width, h: height };
          onSizeRef.current?.(width, height);
        }
      })
      .catch(() => {
        /* a truncated or malformed frame: keep the previous picture on screen */
      });

    return () => {
      cancelled = true;
    };
  }, [frameUrl, getBlob]);

  return <canvas ref={canvasRef} className={className} />;
}
