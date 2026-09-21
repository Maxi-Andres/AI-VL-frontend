import { useEffect, useRef, useState } from "react";

/** What the drive branch is doing right now, for the caption under the video. */
export interface H264FrameStats {
  fps: number;
  kbps: number;
  /** Frames the decoder rejected. Non-zero means the bitstream and the codec string disagree. */
  errors: number;
}

interface State {
  connected: boolean;
  stats: H264FrameStats | null;
  error: string | null;
}

/**
 * The drive branch: all-intra H.264, one access unit per WebSocket message, decoded with
 * WebCodecs and painted on a canvas.
 *
 * WHY NOT WebRTC, which already exists here. Measured 2026-09-21, the WHEP path arrives ~300 ms
 * behind the MJPEG one, and halving SRT's receive buffer (129 -> 70 ms) moved that total by
 * NOTHING: the receiver's jitter buffer simply held what arrived earlier. This path has no
 * jitter buffer to hold anything — every frame is a keyframe, it is drawn the moment it
 * decodes, and a lost one costs exactly one frame.
 *
 * WHAT IT BUYS over the MJPEG it replaces, measured on the robot the same day: 4207 B per
 * frame against ~9000 at the same quality (PSNR 29.34 vs 29.30), delivered at 14.5 fps against
 * the MJPEG's 10 — more frames for a third less bandwidth. Decoding costs 0.7 ms a frame.
 *
 * WIRE FORMAT: 8-byte little-endian double (the robot's clock at capture) + the access unit,
 * in ONE binary message. One message so a frame and its capture time cannot be paired wrongly.
 */
export function useH264FrameStream(
  url: string,
  active: boolean,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
) {
  const [state, setState] = useState<State>({ connected: false, stats: null, error: null });
  const statsRef = useRef({ frames: 0, bytes: 0, errors: 0, at: 0 });

  useEffect(() => {
    if (!active || !url) {
      setState({ connected: false, stats: null, error: null });
      return;
    }
    if (typeof VideoDecoder === "undefined") {
      // WebCodecs needs a secure context. The app is served over HTTPS, so this only bites on
      // a plain-HTTP deployment — and it bites silently, which is why it is said out loud.
      setState({
        connected: false, stats: null,
        error: "This browser has no VideoDecoder (WebCodecs needs HTTPS or localhost)",
      });
      return;
    }

    let cancelled = false;
    let decoder: VideoDecoder | null = null;
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";

    const ctx = canvasRef.current?.getContext("2d") ?? null;
    const paint = (frame: VideoFrame) => {
      const canvas = canvasRef.current;
      if (canvas && ctx) {
        if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
          canvas.width = frame.displayWidth;
          canvas.height = frame.displayHeight;
        }
        ctx.drawImage(frame, 0, 0);
      }
      frame.close();
    };

    /**
     * The codec string has to come from the stream's own SPS, and the byte offset is the trap:
     * profile, constraints and level are the three bytes AFTER the NAL header byte, not from
     * it. Reading them one byte early yields a plausible-looking codec that `configure()`
     * ACCEPTS and every `decode()` then rejects with "Operation is not supported" — measured
     * on 2026-09-21, and it cost a debugging round.
     */
    const codecFrom = (au: Uint8Array): string | null => {
      for (let i = 0; i + 4 < au.length; i++) {
        if (au[i] !== 0 || au[i + 1] !== 0) continue;
        const hdr = au[i + 2] === 1 ? 3 : au[i + 2] === 0 && au[i + 3] === 1 ? 4 : 0;
        if (!hdr) continue;
        if ((au[i + hdr] & 0x1f) !== 7) continue;              // want the SPS
        const p = au.subarray(i + hdr + 1, i + hdr + 4);        // profile, constraints, level
        if (p.length < 3) return null;
        return "avc1." + [...p].map((b) => b.toString(16).padStart(2, "0")).join("");
      }
      return null;
    };

    ws.onopen = () => !cancelled && setState((s) => ({ ...s, connected: true, error: null }));
    ws.onclose = () => !cancelled && setState((s) => ({ ...s, connected: false }));
    ws.onerror = () =>
      !cancelled && setState((s) => ({ ...s, connected: false, error: "socket failed" }));

    ws.onmessage = (ev) => {
      if (cancelled || typeof ev.data === "string") return;
      const buf = ev.data as ArrayBuffer;
      if (buf.byteLength <= 8) return;
      const au = new Uint8Array(buf, 8);

      if (!decoder) {
        const codec = codecFrom(au);
        if (!codec) return;                    // no SPS yet: wait for one, every frame has it
        decoder = new VideoDecoder({
          output: paint,
          error: (e) => {
            statsRef.current.errors++;
            setState((s) => ({ ...s, error: e.message }));
          },
        });
        try {
          decoder.configure({ codec, optimizeForLatency: true });
        } catch (e) {
          setState((s) => ({ ...s, error: e instanceof Error ? e.message : String(e) }));
          decoder = null;
          return;
        }
      }
      // EVERY frame is a keyframe here, which is the property the whole branch rests on: the
      // decoder never needs a reference, so a dropped message costs one picture and nothing
      // after it.
      decoder.decode(new EncodedVideoChunk({
        type: "key",
        timestamp: Math.round(performance.now() * 1000),
        data: au,
      }));
      const st = statsRef.current;
      st.frames++;
      st.bytes += au.byteLength;
    };

    // Rates from deltas, never from the cumulative totals: those only grow and say nothing
    // about what the link is doing now. Same discipline as the WHEP hook.
    const timer = setInterval(() => {
      const st = statsRef.current;
      const now = performance.now();
      if (st.at) {
        const dt = (now - st.at) / 1000;
        setState((s) => ({
          ...s,
          stats: { fps: st.frames / dt, kbps: (st.bytes * 8) / dt / 1000, errors: st.errors },
        }));
      }
      st.frames = 0;
      st.bytes = 0;
      st.at = now;
    }, 1000);

    return () => {
      cancelled = true;
      clearInterval(timer);
      ws.onopen = ws.onclose = ws.onerror = ws.onmessage = null;
      ws.close();
      // Closing the decoder releases the hardware surfaces behind it; leaking one per
      // transport switch is how a page ends up unable to open another.
      try {
        decoder?.close();
      } catch {
        /* already closed */
      }
      decoder = null;
    };
  }, [url, active, canvasRef]);

  return state;
}
