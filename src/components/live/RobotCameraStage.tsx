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
  /**
   * Canvas for the all-intra H.264 branch. When set it REPLACES the picture the same way
   * `stream` does; the overlay, the fullscreen button and the caption are untouched. The
   * frames are painted by `useH264FrameStream`, which owns this ref — this component only
   * puts it on the page.
   */
  intraCanvasRef?: React.RefObject<HTMLCanvasElement | null> | null;
  /**
   * The WebRTC <video>, owned by the caller so it can grab the frame on screen
   * (lib/capture.ts). Omitted, the stage keeps a ref of its own.
   */
  videoElRef?: React.RefObject<HTMLVideoElement | null>;
  /**
   * A frame held on screen INSTEAD of the live picture: the browser-side YOLO pairing shows
   * the exact grab its boxes were computed from (lib/framePairing.ts). The live element stays
   * mounted underneath at opacity 0 — not display:none, which can stop a <video> decoding —
   * so the next grab still has something to read.
   */
  still?: HTMLCanvasElement | null;
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
  intraCanvasRef = null,
  videoElRef,
  still = null,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stillRef = useRef<HTMLCanvasElement>(null);
  const ownVideoRef = useRef<HTMLVideoElement>(null);
  const videoRef = videoElRef ?? ownVideoRef;
  // The frame's native size, reported by CameraCanvas. The overlay must match it so the
  // normalized bboxes land in the right place; it used to come off the <img>'s
  // naturalWidth, which no longer exists.
  const [size, setSize] = useState({ w: 1280, h: 960 });
  const onSize = useCallback((w: number, h: number) => setSize({ w, h }), []);

  // The overlay must take the size of whatever is ON SCREEN, read at draw time. The intra
  // canvas never reported its size, so boxes over it would have been laid out on the
  // 1280x960 default — off by the aspect ratio. Read from the element, it cannot be stale.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const intra = intraCanvasRef?.current;
    const video = videoRef.current;
    const [w, h] = still ? [still.width, still.height]
      : intra?.width ? [intra.width, intra.height]
        : stream && video?.videoWidth ? [video.videoWidth, video.videoHeight]
          : [size.w, size.h];
    // The overlay stays a SEPARATE canvas from the video: drawBoxes() clears before it
    // draws, so sharing one surface would wipe the frame every time boxes change.
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    drawBoxes(canvas, objects, overrideColor);
  }, [objects, overrideColor, frameUrl, size, still, stream, intraCanvasRef, videoRef]);

  // Paint the held frame. Its boxes arrive in the same render (the pairing hands both over
  // together), so the overlay effect above lays them out on this frame's size.
  useEffect(() => {
    const c = stillRef.current;
    if (!c || !still) return;
    c.width = still.width;
    c.height = still.height;
    c.getContext("2d")?.drawImage(still, 0, 0);
  }, [still]);

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
  }, [stream, onSize, videoRef]);

  return (
    <section className="min-w-0">
      <div
        ref={wrapRef}
        className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-line bg-black"
      >
        {intraCanvasRef ? (
          <canvas
            ref={intraCanvasRef}
            className={`absolute inset-0 h-full w-full object-contain${still ? " opacity-0" : ""}`}
          />
        ) : stream ? (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className={`absolute inset-0 h-full w-full object-contain${still ? " opacity-0" : ""}`}
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
        {still && (
          <canvas ref={stillRef} className="absolute inset-0 h-full w-full object-contain" />
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
