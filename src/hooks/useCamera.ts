import { useCallback, useEffect, useRef, useState } from "react";

/** Which camera to request: rear ("environment") or front ("user"). */
export type Facing = "environment" | "user";

/**
 * Owns the webcam lifecycle: getUserMedia, attach to a <video>, teardown, and
 * switching between front/rear cameras (relevant on phones). The returned
 * videoRef must be placed on the <video> element. Defaults to the rear camera,
 * which is what you want when using a phone as the camera.
 */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [facing, setFacing] = useState<Facing>("environment");
  const [error, setError] = useState<string | null>(null);

  const acquire = useCallback(async (want: Facing) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: { ideal: want },
      },
      audio: false,
    });
    // Swap the live stream in place (keeps the same <video> element and any
    // open detection socket).
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = stream;
    const video = videoRef.current;
    if (video) {
      video.srcObject = stream;
      await video.play();
    }
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      await acquire(facing);
      setActive(true);
    } catch (e) {
      setError(`Camera error: ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    }
  }, [acquire, facing]);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) video.srcObject = null;
    setActive(false);
  }, []);

  const flip = useCallback(async () => {
    const next: Facing = facing === "environment" ? "user" : "environment";
    setFacing(next);
    if (!active) return;
    try {
      await acquire(next);
    } catch (e) {
      setError(`Camera error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [facing, active, acquire]);

  // Release the camera when the hook unmounts (e.g. navigating away with the
  // camera still active), so the webcam/tracks don't stay live. `stop` is stable.
  useEffect(() => stop, [stop]);

  return { videoRef, active, facing, error, start, stop, flip };
}
