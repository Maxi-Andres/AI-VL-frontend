import { useCallback, useEffect, useRef, useState } from "react";
import { WS_URL } from "../config";
import type {
  ConfigState,
  DetectionMessage,
  ServerMessage,
  YoloConfig,
} from "../types";

interface Params {
  /** When true, open the socket and start the frame pump. */
  active: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Current YOLO config; pushed to the server on connect and on change. */
  config: YoloConfig;
  onResult: (msg: DetectionMessage) => void;
  onError?: (message: string) => void;
  /** Called when the server pushes a shared-config change (e.g. from the monitor)
   * so this client can update its own controls. */
  onConfig?: (state: ConfigState) => void;
}

/**
 * Streams JPEG frames over the /ws/detect WebSocket and relays detections back.
 *
 * Pacing: exactly ONE frame is kept in flight at a time — the next frame is sent
 * only after the previous reply arrives. This auto-throttles to the server's
 * rate. Latest callbacks/config are kept in refs so the socket isn't torn down
 * on every render.
 */
export function useDetectionSocket({
  active,
  videoRef,
  config,
  onResult,
  onError,
  onConfig,
}: Params) {
  const [connected, setConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const inFlightRef = useRef(false);
  const rafRef = useRef(0);
  const grabRef = useRef<HTMLCanvasElement | null>(null);
  const lastSentRef = useRef(0); // performance.now() of the last frame sent (FPS cap)

  const configRef = useRef(config);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  const onConfigRef = useRef(onConfig);
  useEffect(() => {
    configRef.current = config;
  }, [config]);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  useEffect(() => {
    onConfigRef.current = onConfig;
  }, [onConfig]);

  const sendConfig = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(configRef.current));
    }
  }, []);

  // Push config to the server whenever it changes (while connected).
  useEffect(() => {
    if (connected) sendConfig();
  }, [config, connected, sendConfig]);

  useEffect(() => {
    if (!active) return;

    if (!grabRef.current) grabRef.current = document.createElement("canvas");
    const grab = grabRef.current;
    const gctx = grab.getContext("2d");

    const ws = new WebSocket(WS_URL);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify(configRef.current));
    };
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string) as ServerMessage;
      if (msg.type === "detections") {
        onResultRef.current(msg);
        inFlightRef.current = false;
      } else if (msg.type === "error") {
        onErrorRef.current?.(msg.message);
        inFlightRef.current = false;
      } else if (msg.type === "config") {
        onConfigRef.current?.(msg.state);
      }
    };

    // Send one frame whenever the previous one has been answered.
    const pump = () => {
      const video = videoRef.current;
      // Optional FPS cap: don't send the next frame until enough time has passed.
      const maxFps = configRef.current.max_fps ?? 0;
      const minInterval = maxFps > 0 ? 1000 / maxFps : 0;
      const now = performance.now();
      if (
        gctx &&
        ws.readyState === WebSocket.OPEN &&
        !inFlightRef.current &&
        video &&
        video.readyState >= 2 &&
        now - lastSentRef.current >= minInterval
      ) {
        lastSentRef.current = now;
        const vw = video.videoWidth || 1280;
        const vh = video.videoHeight || 720;
        // Latency: downscale to the YOLO input size before encoding. iacore
        // resizes to imgsz anyway, so uploading more pixels only adds upload
        // time for zero detection gain. (bbox coords are normalized, so the
        // overlay is unaffected.)
        const target = configRef.current.imgsz || 640;
        const scale = Math.min(1, target / Math.max(vw, vh));
        const w = Math.max(1, Math.round(vw * scale));
        const h = Math.max(1, Math.round(vh * scale));
        if (grab.width !== w || grab.height !== h) {
          grab.width = w;
          grab.height = h;
        }
        gctx.drawImage(video, 0, 0, w, h);
        grab.toBlob(
          (blob) => {
            if (blob && ws.readyState === WebSocket.OPEN) {
              inFlightRef.current = true;
              blob.arrayBuffer().then((buf) => ws.send(buf));
            }
          },
          "image/jpeg",
          0.7,
        );
      }
      rafRef.current = requestAnimationFrame(pump);
    };
    rafRef.current = requestAnimationFrame(pump);

    return () => {
      cancelAnimationFrame(rafRef.current);
      inFlightRef.current = false;
      ws.onopen = ws.onclose = ws.onerror = ws.onmessage = null;
      ws.close();
      wsRef.current = null;
      setConnected(false);
    };
    // videoRef is a stable ref; config/callbacks are read from refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return { connected };
}
