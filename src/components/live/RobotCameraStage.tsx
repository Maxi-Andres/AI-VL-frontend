import { useCallback, useEffect, useRef, useState } from "react";
import { FullscreenButton } from "../ui/FullscreenButton";
import { CameraCanvas } from "./CameraCanvas";
import { drawBoxes } from "../../lib/draw";
import type { DetectedObject } from "../../types";

interface Props {
  /** Changes once per frame (empty until the first one). Ignored when `stream` is set. */
  frameUrl: string;
  /** The freshest JPEG, from the same hook that produced `frameUrl`. */
  getBlob: () => Blob | null;
  connected: boolean;
  /** Boxes to draw (live detections, or a VLM overlay). */
  objects: DetectedObject[];
  /** Force one color for all boxes (VLM overlay); omit for per-class colors. */
  overrideColor?: string;
  /** Caption shown under the video (e.g. "Robot camera" / "Session mirror"). */
  label?: string;
  /** Appended to the caption: which transport is playing and how it is doing. */
  detail?: string;
  /**
   * WebRTC track from a WHEP endpoint. When present it REPLACES the JPEG canvas as the
   * picture source; the overlay, the fullscreen button and the caption are unchanged, which
   * is the whole reason this lives here instead of in a second stage component.
   *
   * The boxes still arrive over the backend's view socket, so this only moves the PICTURE
   * off that path.
   */
  stream?: MediaStream | null;
}

/**
 * Read-only video stage for a fanned-out source (robot camera or a session
 * mirror). Renders the frame, a YOLO/VLM overlay, and a fullscreen button. The
 * canvas tracks the frame's native size and uses the same object-contain CSS, so
 * normalized bboxes stay aligned. The camera-source picker lives on the page.
 */
export function RobotCameraStage({
  frameUrl,
  getBlob,
  connected,
  objects,
  overrideColor,
  label = "Robot camera",
  detail,
  stream = null,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  // The frame's native size, reported by CameraCanvas. The overlay must match it so the
  // normalized bboxes land in the right place; it used to come off the <img>'s
  // naturalWidth, which no longer exists.
  const [size, setSize] = useState({ w: 1280, h: 960 });
  const onSize = useCallback((w: number, h: number) => setSize({ w, h }), []);

  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // The overlay stays a SEPARATE canvas from the video: drawBoxes() clears before it
    // draws, so sharing one surface would wipe the frame every time boxes change.
    if (canvas.width !== size.w) canvas.width = size.w;
    if (canvas.height !== size.h) canvas.height = size.h;
    drawBoxes(canvas, objects, overrideColor);
  };
  useEffect(redraw, [objects, overrideColor, frameUrl, size]);

  // srcObject cannot be set from JSX. Track the video's native size the same way
  // CameraCanvas reports the JPEG's, so the normalized bboxes keep landing in the right
  // place whichever source is playing.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    const report = () => {
      if (video.videoWidth) onSize(video.videoWidth, video.videoHeight);
    };
    video.addEventListener("loadedmetadata", report);
    video.addEventListener("resize", report);
    report();
    return () => {
      video.removeEventListener("loadedmetadata", report);
      video.removeEventListener("resize", report);
      video.srcObject = null;
    };
  }, [stream, onSize]);

  return (
    <section className="min-w-0">
      <div
        ref={wrapRef}
        className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-line bg-black"
      >
        {stream ? (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="absolute inset-0 h-full w-full object-contain"
          />
        ) : frameUrl ? (
          <CameraCanvas
            frameUrl={frameUrl}
            getBlob={getBlob}
            onSize={onSize}
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
        {detail ? ` · ${detail}` : ""}
      </div>
    </section>
  );
}
