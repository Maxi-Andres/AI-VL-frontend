import { useEffect, useRef } from "react";
import { useVideoTransport } from "../layout/VideoTransportContext";
import { CameraCanvas } from "./CameraCanvas";
import { useT } from "../../i18n";

interface Props {
  /** From useRobotCameraView: the newest MJPEG frame (empty until the first one). */
  frameUrl: string;
  getBlob: () => Blob | null;
  /** The view socket is open (the picture may still be on its way). */
  connected: boolean;
}

const FILL = "absolute inset-0 h-full w-full object-contain";

/**
 * The robot's picture on whichever transport the app has picked (VideoTransportContext): the
 * all-intra canvas, the WebRTC H.264 track, or the MJPEG frames of the view socket. It fills
 * its positioned parent; the parent puts the chips and buttons over it. Drive and Agent show
 * the robot through this one component, so the two cannot disagree about which path is live.
 */
export function RobotPicture({ frameUrl, getBlob, connected }: Props) {
  const t = useT();
  const { transport, stream, intraCanvasRef } = useVideoTransport();
  const videoRef = useRef<HTMLVideoElement>(null);
  const showVideo = transport === "h264" && !!stream;
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !stream || !showVideo) return;
    el.srcObject = stream; // srcObject cannot be set from JSX
    return () => {
      el.srcObject = null;
    };
  }, [stream, showVideo]);

  if (transport === "intra" && intraCanvasRef) {
    // The all-intra branch paints itself; this component only places the canvas.
    return <canvas ref={intraCanvasRef} className={FILL} />;
  }
  if (showVideo) return <video ref={videoRef} autoPlay muted playsInline className={FILL} />;
  if (frameUrl) return <CameraCanvas frameUrl={frameUrl} getBlob={getBlob} className={FILL} />;
  return (
    <div className="absolute inset-0 flex items-center justify-center text-sm text-white/60">
      {connected ? t("Waiting for the robot camera…") : t("Connecting…")}
    </div>
  );
}
