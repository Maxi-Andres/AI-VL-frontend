import { useEffect, useState } from "react";
import { WS_VIEW_URL } from "../config";
import type { ViewMessage } from "../types";

/**
 * Display the robot camera on a client that is NOT the producer (e.g. the phone /
 * Live page acting as a remote monitor). Subscribes to the shared view stream
 * (`/ws/view`) while `active` is true — the same fan-out the read-only monitor uses
 * — and returns the latest JPEG frame as a data URL. Raw view (no detection
 * overlay). Opens the socket on activate; closes it and clears the frame on
 * deactivate/unmount.
 */
export function useRobotCameraView(active: boolean) {
  const [frameUrl, setFrameUrl] = useState("");
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!active) return;
    const ws = new WebSocket(WS_VIEW_URL);
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(ev.data as string) as ViewMessage;
        if (m.type === "frame") {
          setFrameUrl(`data:image/jpeg;base64,${m.jpeg_b64}`);
        }
      } catch {
        /* ignore malformed messages */
      }
    };
    return () => {
      ws.onopen = ws.onclose = ws.onerror = ws.onmessage = null;
      ws.close();
      setConnected(false);
      setFrameUrl("");
    };
  }, [active]);

  return { frameUrl, connected };
}
