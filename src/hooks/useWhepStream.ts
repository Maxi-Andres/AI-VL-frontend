import { useEffect, useRef, useState } from "react";

/**
 * Play a WebRTC stream from a WHEP endpoint (mediamtx's `/<path>/whep`).
 *
 * WHY this exists next to the MJPEG path rather than replacing it: over the field link the
 * robot's MJPEG costs ~8.9 Mbps PER VIEWER, because the robot serves a full copy to each
 * one, while the H.264 it already encodes costs 1.4 Mbps ONCE and mediamtx fans it out at
 * HQ (measured 2026-09-11). The MJPEG path stays the fallback and the default; this turns
 * on only when a WHEP URL is configured.
 *
 * Non-trickle ICE: the offer is sent after gathering finishes, which is what WHEP expects
 * and what mediamtx accepts. Viewer and server are both on the HQ LAN, so no STUN/TURN is
 * configured — mediamtx has none either, and a viewer outside that LAN would need both.
 */
export interface WhepState {
  stream: MediaStream | null;
  connected: boolean;
  /** Last failure, cleared once a later attempt connects. */
  error: string | null;
  /** Live receive stats, so the two transports can be compared on the same link. */
  stats: WhepStats | null;
}

export interface WhepStats {
  fps: number;
  kbps: number;
  /**
   * Freezes as the DECODER counts them. Not the same as "no frame painted": a backgrounded
   * tab stops presenting frames while the decoder keeps going, so a gap measured by
   * requestVideoFrameCallback invents stalls this number does not.
   */
  freezes: number;
  freezeSeconds: number;
  jitterBufferMs: number;
  packetsLost: number;
}

const GATHER_TIMEOUT_MS = 2000;
const STATS_EVERY_MS = 2000;
const RETRY_MIN_MS = 1000;
const RETRY_MAX_MS = 15000;

export function useWhepStream(url: string, active = true): WhepState {
  const [state, setState] = useState<WhepState>({
    stream: null,
    connected: false,
    error: null,
    stats: null,
  });
  // Kept in a ref so a reconnect does not need the render loop to have caught up.
  const backoffRef = useRef(RETRY_MIN_MS);

  useEffect(() => {
    if (!url || !active) {
      setState({ stream: null, connected: false, error: null, stats: null });
      return;
    }

    let cancelled = false;
    let pc: RTCPeerConnection | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    // The WHEP session resource, so it can be released instead of left dangling on the
    // server for every reconnect.
    let resource: string | null = null;
    let statsTimer: ReturnType<typeof setInterval> | undefined;
    let prev: { frames: number; bytes: number; at: number } | null = null;

    const teardown = () => {
      clearInterval(statsTimer);
      prev = null;
      if (resource) {
        // Best-effort: the page may be unloading. keepalive lets it leave anyway.
        fetch(resource, { method: "DELETE", keepalive: true }).catch(() => {});
        resource = null;
      }
      pc?.close();
      pc = null;
    };

    const schedule = () => {
      if (cancelled) return;
      const wait = backoffRef.current;
      // Grow the backoff for the NEXT failure, and reset it on success — not doing the
      // reset is what once turned a blip into 15-second outages on the robot bridge.
      backoffRef.current = Math.min(backoffRef.current * 2, RETRY_MAX_MS);
      retry = setTimeout(connect, wait);
    };

    /** Chromium exposes `playoutDelayHint` on the receiver; the typings do not. */
    const setPlayoutDelay = (receiver: RTCRtpReceiver, seconds: number) => {
      const r = receiver as RTCRtpReceiver & { playoutDelayHint?: number };
      if ("playoutDelayHint" in r) r.playoutDelayHint = seconds;
    };

    const connect = async () => {
      if (cancelled) return;
      teardown();
      try {
        pc = new RTCPeerConnection({ iceServers: [] });
        pc.addTransceiver("video", { direction: "recvonly" });
        pc.ontrack = (e) => {
          // Ask the jitter buffer for the smallest playout delay it can manage.
          //
          // WHY, and it is the one knob that was left: MEASURED 2026-09-21, the H.264 path
          // arrives ~300 ms behind the MJPEG one, and halving SRT's receive buffer
          // (129 -> 70 ms) moved that total by NOTHING — because whatever arrives earlier
          // just waits longer downstream. The receiver's jitter buffer is what holds it, and
          // this is the only handle on it from a page.
          //
          // Chromium-only and advisory: Firefox ignores it, and even where honoured it is a
          // HINT, not a setting — the buffer still grows when the network makes it grow. The
          // effect is visible in `stats.jitterBufferMs`, which this hook already reports.
          setPlayoutDelay(e.receiver, 0);
          if (!cancelled) {
            setState((s) => ({ ...s, stream: e.streams[0], connected: true, error: null }));
            backoffRef.current = RETRY_MIN_MS;
          }
        };
        pc.oniceconnectionstatechange = () => {
          const st = pc?.iceConnectionState;
          if (st === "failed" || st === "disconnected" || st === "closed") {
            setState((s) => ({ ...s, connected: false }));
            if (st === "failed") schedule();
          }
        };

        // Rates are derived from deltas between polls, not from the cumulative totals:
        // framesDecoded and bytesReceived only ever grow, so a raw reading says nothing
        // about what the link is doing right now.
        statsTimer = setInterval(async () => {
          const report = await pc?.getStats().catch(() => null);
          if (!report || cancelled) return;
          report.forEach((r) => {
            if (r.type !== "inbound-rtp" || r.kind !== "video") return;
            const now = { frames: r.framesDecoded ?? 0, bytes: r.bytesReceived ?? 0, at: r.timestamp };
            if (prev && now.at > prev.at) {
              const dt = (now.at - prev.at) / 1000;
              setState((s) => ({
                ...s,
                stats: {
                  fps: (now.frames - prev!.frames) / dt,
                  kbps: ((now.bytes - prev!.bytes) * 8) / dt / 1000,
                  freezes: r.freezeCount ?? 0,
                  freezeSeconds: r.totalFreezesDuration ?? 0,
                  jitterBufferMs: r.jitterBufferEmittedCount
                    ? Math.round((1000 * r.jitterBufferDelay) / r.jitterBufferEmittedCount)
                    : 0,
                  packetsLost: r.packetsLost ?? 0,
                },
              }));
            }
            prev = now;
          });
        }, STATS_EVERY_MS);

        await pc.setLocalDescription(await pc.createOffer());
        await new Promise<void>((resolve) => {
          if (!pc || pc.iceGatheringState === "complete") return resolve();
          const done = () => {
            if (pc?.iceGatheringState === "complete") resolve();
          };
          pc.addEventListener("icegatheringstatechange", done);
          setTimeout(resolve, GATHER_TIMEOUT_MS); // send what we have rather than hang
        });
        if (cancelled || !pc?.localDescription) return;

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/sdp" },
          body: pc.localDescription.sdp,
        });
        if (!res.ok) throw new Error(`WHEP ${res.status}`);
        const loc = res.headers.get("Location");
        if (loc) resource = new URL(loc, url).toString();
        const answer = await res.text();
        if (cancelled || !pc) return;
        await pc.setRemoteDescription({ type: "answer", sdp: answer });
      } catch (err) {
        if (cancelled) return;
        setState({
          stream: null,
          connected: false,
          error: err instanceof Error ? err.message : String(err),
          stats: null,
        });
        schedule();
      }
    };

    void connect();
    return () => {
      cancelled = true;
      clearTimeout(retry);
      teardown();
    };
  }, [url, active]);

  return state;
}
