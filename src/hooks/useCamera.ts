import { useCallback, useRef, useState } from "react";

/**
 * Owns the webcam lifecycle: getUserMedia, attach to a <video>, and teardown.
 * The returned videoRef must be placed on the <video> element.
 */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
      setActive(true);
    } catch (e) {
      setError(`Camera error: ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    }
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) video.srcObject = null;
    setActive(false);
  }, []);

  return { videoRef, active, error, start, stop };
}
