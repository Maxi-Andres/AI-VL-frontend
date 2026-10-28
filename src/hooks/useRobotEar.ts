import { useEffect, useRef, useState } from "react";
import { EAR_OFF, earEvent, type EarView } from "../lib/robotEar";
import { t } from "../i18n";

/**
 * The robot's own microphone, Alexa-style, over /ws/robot-ear (backend -> executor -> relay,
 * and the backend -> iacore's ear for listening). While `enabled` the socket is open and the
 * robot's mic is on; turning it off closes the socket, and the relay switches the mic off at
 * once. `muted` (the page is speaking) is passed on so the ear never answers the robot's own
 * voice; with `barge` it still hears its name, and `onBarge` is "stop talking" (with the new
 * request, or "" for a bare "Bender"). The ear finds "Bender, …" itself: `onCommand` gets just
 * the request.
 *
 * There is ONE ear per robot (the backend's rule): opening it on a page takes it from any other,
 * and switching it off here sends {"type": "off"} first, which switches it off for every page —
 * two tabs listening once both answered, and turning one off left the robot listening.
 */
export function useRobotEar({
  url,
  enabled,
  muted,
  barge,
  onCommand,
  onWake,
  onBarge,
}: {
  url: string;
  enabled: boolean;
  muted: boolean;
  barge: boolean;
  onCommand: (text: string) => void;
  onWake: () => void;
  onBarge: (text: string) => void;
}): EarView {
  const [view, setView] = useState<EarView>(EAR_OFF);
  const viewRef = useRef(view);
  viewRef.current = view;
  const callbacks = useRef({ onCommand, onWake, onBarge });
  callbacks.current = { onCommand, onWake, onBarge };
  const wsRef = useRef<WebSocket | null>(null);
  const mutedRef = useRef({ muted, barge });
  mutedRef.current = { muted, barge };

  useEffect(() => {
    if (!enabled) {
      setView(EAR_OFF);
      return;
    }
    setView({ ...EAR_OFF, state: "connecting" });
    const ws = new WebSocket(url);
    wsRef.current = ws;
    let closedHere = false;
    ws.onopen = () => ws.send(JSON.stringify({ type: "mute", on: mutedRef.current.muted, barge: mutedRef.current.barge }));
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
      else if (action?.kind === "barge") callbacks.current.onBarge(action.text);
    };
    ws.onclose = () => {
      if (closedHere) return;
      setView((v) => (v.state === "error" ? v : { ...v, state: "error",
        error: t("the connection closed") }));
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
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "mute", on: muted, barge }));
  }, [muted, barge]);

  return view;
}
