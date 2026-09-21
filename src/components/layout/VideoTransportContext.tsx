import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { WHEP_URL } from "../../config";
import { useWhepStream, type WhepStats } from "../../hooks/useWhepStream";

export type VideoTransport = "mjpeg" | "h264";

interface VideoTransportValue {
  transport: VideoTransport;
  setTransport: (t: VideoTransport) => void;
  /** Whether there is anything to switch TO (a WHEP endpoint is configured). */
  available: boolean;
  /** The H.264 track, or null while on MJPEG or not yet connected. */
  stream: MediaStream | null;
  connected: boolean;
  stats: WhepStats | null;
  /** One line describing the active path, for a caption under the video. */
  detail: string;
  /**
   * Why the last H.264 attempt failed, kept AFTER the fall-back to MJPEG.
   *
   * It has to be latched here: the fall-back disables the WHEP hook, whose own state resets
   * to `error: null` on the way out, so the reason would vanish in the same tick that the
   * picture went back to MJPEG. That is exactly what made this look like "the button does
   * nothing" on a machine where WHEP cannot connect.
   */
  lastError: string | null;
  /** The WHEP endpoint, so the UI can point a human at it (see `lastError`). */
  whepUrl: string;
}

const Ctx = createContext<VideoTransportValue | null>(null);

/**
 * One transport choice for the whole app, and ONE WebRTC connection behind it.
 *
 * WHY A CONTEXT and not per-page state. The choice is global by nature: Drive and Live show
 * the same camera, and the point of the switch is to compare the two paths on the same link
 * — cable, LTE and Starlink in turn. A per-page toggle would let the two pages disagree
 * about which path is under test, which is exactly the way to get a comparison that means
 * nothing. Sharing the peer connection also means opening Drive and Live at once costs the
 * server one reader, not two.
 *
 * NOT YET GLOBAL, and this is the honest limit today: this switches the PICTURE. YOLO and
 * the VLM are fed by the camera bridge, whose source is its own setting, so flipping this
 * does not move them. Making one control move both needs a route from here to the bridge;
 * until that exists, the bridge is switched by its STREAM_URL.
 *
 * MJPEG is the default deliberately. It is the path that has always worked, and when the
 * robot is on a LAN it is the shorter one; H.264 wins where bandwidth is the constraint,
 * because it leaves the robot ONCE (1.4 Mbps) instead of once per viewer (8.9 Mbps each).
 */
export function VideoTransportProvider({ children }: { children: ReactNode }) {
  const [transport, setTransport] = useState<VideoTransport>("mjpeg");
  const available = Boolean(WHEP_URL);
  const { stream, connected, stats, error } = useWhepStream(
    WHEP_URL,
    available && transport === "h264",
  );

  // Never leave the drive view dark: if WebRTC cannot connect, fall back rather than show
  // an empty box. The operator is steering by this picture. In an effect, not in the render
  // body — setting state while rendering is how a render loop starts.
  //
  // But SAY SO. Falling back silently is how this turned into "I press H.264 and nothing
  // happens": the commonest cause is mediamtx's self-signed certificate, which lives on a
  // different origin (:8889) from the app (:8443), so the browser refuses the WHEP request
  // until someone accepts it there ONCE — and refuses it with no visible error.
  const [lastError, setLastError] = useState<string | null>(null);
  useEffect(() => {
    if (transport === "h264" && error) {
      setLastError(error);
      setTransport("mjpeg");
    }
  }, [transport, error]);
  useEffect(() => {
    if (connected) setLastError(null);
  }, [connected]);

  const detail =
    transport === "mjpeg"
      ? "MJPEG over the backend"
      : stats
        ? `H.264/WebRTC ${stats.fps.toFixed(1)} fps · ${Math.round(stats.kbps)} kbps · ` +
          `${stats.freezes} freezes (${stats.freezeSeconds.toFixed(1)}s) · ` +
          `jitter ${stats.jitterBufferMs} ms · lost ${stats.packetsLost}`
        : "H.264/WebRTC · connecting";

  return (
    <Ctx.Provider
      value={{
        transport, setTransport, available, stream, connected, stats, detail,
        lastError, whepUrl: WHEP_URL,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useVideoTransport(): VideoTransportValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useVideoTransport must be used within a VideoTransportProvider");
  return ctx;
}
