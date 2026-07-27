import { useCallback, useEffect, useRef, useState } from "react";
import { WS_VIEW_URL } from "../config";
import type { ConfigState, DetectedObject, ViewMessage, YoloConfig } from "../types";

/**
 * Display the robot camera (or any /ws/view mirror) on a client that is NOT the
 * producer. Subscribes to the shared view stream while `active` is true and returns
 * the latest frame as an object-URL plus any detection boxes.
 *
 * Frames arrive as BINARY WebSocket messages (raw JPEG bytes) — not base64-in-JSON —
 * which is what keeps a viewer from loading the single-process backend. Boxes come
 * in a small JSON `det` message just before each frame.
 *
 * `enabled` is the shared YOLO on/off flag, pushed to the backend so the producer
 * knows whether to run detection. `getLastFrameBlob()` returns the freshest JPEG
 * Blob so a caller can ask the VLM about the current robot-camera frame.
 */
export function useRobotCameraView(
  active: boolean,
  enabled: boolean,
  onConfig?: (state: ConfigState) => void,
) {
  const [frameUrl, setFrameUrl] = useState("");
  const [connected, setConnected] = useState(false);
  const [objects, setObjects] = useState<DetectedObject[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const onConfigRef = useRef(onConfig);
  onConfigRef.current = onConfig;
  const lastBlobRef = useRef<Blob | null>(null);
  const urlRef = useRef<string>(""); // current object URL, revoked on replace/cleanup

  const getLastFrameBlob = useCallback(() => lastBlobRef.current, []);

  // Push a shared-config change into the session over the view socket (so a
  // viewer/mirror can steer YOLO on the producer, like the old monitor did).
  const sendConfig = useCallback((patch: Partial<YoloConfig>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(patch));
  }, []);

  // Push the on/off flag whenever it changes while connected.
  useEffect(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ enabled }));
    }
  }, [enabled]);

  useEffect(() => {
    if (!active) return;
    const ws = new WebSocket(WS_VIEW_URL);
    ws.binaryType = "blob";
    wsRef.current = ws;
    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ enabled: enabledRef.current })); // seed the flag
    };
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (ev) => {
      // Binary => a JPEG frame. Text => a small JSON control/det message.
      if (typeof ev.data !== "string") {
        const blob = ev.data as Blob;
        lastBlobRef.current = blob;
        const url = URL.createObjectURL(blob);
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = url;
        setFrameUrl(url);
        return;
      }
      try {
        const m = JSON.parse(ev.data) as ViewMessage;
        if (m.type === "det") setObjects(m.objects ?? []);
        else if (m.type === "config") onConfigRef.current?.(m.state);
      } catch {
        /* ignore malformed messages */
      }
    };
    return () => {
      ws.onopen = ws.onclose = ws.onerror = ws.onmessage = null;
      ws.close();
      wsRef.current = null;
      setConnected(false);
      setFrameUrl("");
      setObjects([]);
      lastBlobRef.current = null;
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = "";
      }
    };
  }, [active]);

  return { frameUrl, connected, objects, getLastFrameBlob, sendConfig };
}
