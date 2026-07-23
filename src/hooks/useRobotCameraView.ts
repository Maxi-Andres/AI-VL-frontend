import { useEffect, useRef, useState } from "react";
import { WS_VIEW_URL } from "../config";
import type { DetectedObject, ViewMessage } from "../types";

/**
 * Display the robot camera on a client that is NOT the producer (e.g. the phone /
 * Live page acting as a remote monitor). Subscribes to the shared view stream
 * (`/ws/view`) while `active` is true — the same fan-out the read-only monitor uses
 * — and returns the latest JPEG frame as a data URL plus any detection boxes.
 *
 * `enabled` is the shared YOLO on/off flag: it is pushed to the backend so the
 * robot-camera producer knows whether to run detection. When off, frames arrive
 * with no boxes (and no GPU is used); when on, the backend attaches YOLO boxes.
 * Opens the socket on activate; closes it and clears state on deactivate/unmount.
 */
export function useRobotCameraView(active: boolean, enabled: boolean) {
  const [frameUrl, setFrameUrl] = useState("");
  const [connected, setConnected] = useState(false);
  const [objects, setObjects] = useState<DetectedObject[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

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
    wsRef.current = ws;
    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ enabled: enabledRef.current })); // seed the flag
    };
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(ev.data as string) as ViewMessage;
        if (m.type === "frame") {
          setFrameUrl(`data:image/jpeg;base64,${m.jpeg_b64}`);
          setObjects(m.objects ?? []);
        }
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
    };
  }, [active]);

  return { frameUrl, connected, objects };
}
