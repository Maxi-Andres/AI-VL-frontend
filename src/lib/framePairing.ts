/**
 * Pair a picture with ITS OWN detection, in the browser.
 *
 * The H.264 transports (WebRTC off mediamtx, and the all-intra canvas) never pass through the
 * backend, so the backend cannot hold a frame back until its boxes are ready — it never sees
 * the frame. This loop does it here: grab what is on screen, send that grab for detection, and
 * when the answer comes back hand over THE SAME GRAB together with its boxes. The caller shows
 * the grab instead of the live picture, so a box can never be drawn on a frame it does not
 * describe. Measured on 2026-09-16 the unpaired version drew boxes 260 ms ahead of the person
 * (PLAN_YOLO_FRAME_PAIRING.md §2.3).
 *
 * ONE detection in flight, never a queue: the loop is sequential, so the next grab happens only
 * after the previous answer. A queue is how latency accumulates — the same rule the backend's
 * annotated path and the robot's own frame buffers follow.
 *
 * No DOM in here on purpose: grab and detect are injected, which is what lets the tests prove
 * the pairing and the pacing without a browser.
 */

export interface Grab<F> {
  /** What gets shown when the answer arrives (a canvas copy, in the app). */
  frame: F;
  /** What gets sent for detection — encoded FROM `frame`, so the two cannot diverge. */
  blob: Blob;
}

export interface PairingOptions<F, D> {
  /** The picture on screen right now, or null when there is none yet. */
  grab: () => Promise<Grab<F> | null>;
  /** Boxes for one grab. Null or a throw = no answer for this one. */
  detect: (blob: Blob, signal: AbortSignal) => Promise<D | null>;
  /** One grab and the detection made FROM IT. Never called after stop(). */
  onPair: (frame: F, det: D) => void;
  /** Minimum spacing between detections, read every cycle (the YOLO panel's max-fps cap). */
  minIntervalMs?: () => number;
  /** Wait before retrying when there is nothing to grab or the detector failed. */
  retryMs?: number;
  /** Injected for the tests; real time otherwise. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Start pairing. Returns stop(): it aborts the detection in flight and no pair is delivered
 *  after it — a late answer belongs to a picture the operator has already left. */
export function startPairing<F, D>(o: PairingOptions<F, D>): () => void {
  const sleep = o.sleep ?? realSleep;
  const now = o.now ?? (() => performance.now());
  const retry = o.retryMs ?? 250;
  let running = true;
  let abort: AbortController | null = null;

  (async () => {
    while (running) {
      const started = now();
      let delivered = false;
      try {
        const g = await o.grab();
        if (g && running) {
          abort = new AbortController();
          const det = await o.detect(g.blob, abort.signal);
          if (det && running) {
            o.onPair(g.frame, det);
            delivered = true;
          }
        }
      } catch {
        /* a failed grab or detection is just a missed pair; the loop goes on */
      }
      abort = null;
      if (!running) break;
      if (!delivered) {
        await sleep(retry);
        continue;
      }
      // ALWAYS sleep, even 0 ms: that is a macrotask, so the loop yields the event loop every
      // cycle. Skipping it when there is no gap turned a grab and a detect that resolve at once
      // into a microtask spin that never yields — it hung the whole machine once (2026-10-07,
      // in the tests, whose fakes answer instantly).
      await sleep(Math.max(0, (o.minIntervalMs?.() ?? 0) - (now() - started)));
    }
  })();

  return () => {
    running = false;
    abort?.abort();
  };
}
