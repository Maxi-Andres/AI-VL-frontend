import { useEffect, useRef, useState } from "react";
import { EAR_OFF, earEvent, type EarView } from "../lib/robotEar";

/**
 * The robot's own microphone, Alexa-style, over /ws/robot-ear (backend -> executor -> relay,
 * and the backend -> iacore's ear for listening). While `enabled` the socket is open and the
 * robot's mic is on; turning it off closes the socket, and the relay switches the mic off at
 * once. `muted` (the page is speaking) is passed on so the ear never answers the robot's own
 * voice. The ear finds "Bender, …" itself: `onCommand` gets just the request.
 *
 * There is ONE ear per robot (the backend's rule): opening it on a page takes it from any other,
 * and switching it off here sends {"type": "off"} first, which switches it off for every page —
 * two tabs listening once both answered, and turning one off left the robot listening.
 */
export function useRobotEar({
  url,
  enabled,
  muted,
  onCommand,
  onWake,
}: {
  url: string;
  enabled: boolean;
  muted: boolean;
  onCommand: (text: string) => void;
  onWake: () => void;
}): EarView {
  const [view, setView] = useState<EarView>(EAR_OFF);
  const viewRef = useRef(view);
  viewRef.current = view;
  const callbacks = useRef({ onCommand, onWake });
  callbacks.current = { onCommand, onWake };
  const wsRef = useRef<WebSocket | null>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  useEffect(() => {
    if (!enabled) {
      setView(EAR_OFF);
      return;
    }
    setView({ ...EAR_OFF, state: "connecting" });
    const ws = new WebSocket(url);
    wsRef.current = ws;
    let closedHere = false;
    ws.onopen = () => ws.send(JSON.stringify({ type: "mute", on: mutedRef.current }));
    ws.onmessage = (m) => {
      let raw: unknown;
      try {
        raw = JSON.parse(String(m.data));
      } catch {
        return;
      }
      const { view: next, action } = earEvent(viewRef.current, raw);
      setView(next);
      if (action?.kind === "command") callbacks.current.onCommand(action.text);
      else if (action?.kind === "wake") callbacks.current.onWake();
    };
    ws.onclose = () => {
      if (closedHere) return;
      setView((v) => (v.state === "error" ? v : { ...v, state: "error",
        error: "the connection closed" }));
    };
    return () => {
      closedHere = true;
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "off" }));
      ws.close();
      wsRef.current = null;
    };
  }, [enabled, url]);

  useEffect(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "mute", on: muted }));
  }, [muted]);

  return view;
}
