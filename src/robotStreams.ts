/**
 * Which mediamtx path carries each robot's camera.
 *
 * The Go2 keeps the path it always had, `robot`, because Frigate, the camera bridge and the
 * Splunk dashboard read it by that name; the G1 got its own, `g1`, on 2026-10-01 (HQ runs a
 * second SRT bridge for it — robot-video-pipeline/systemd/srt-bridge-g1.service).
 *
 * Before this, the WebRTC button always asked for `/robot/whep`: with the G1 picked it showed
 * the Go2's camera, or nothing when the Go2 was off, and fell back to MJPEG.
 */
export const MEDIAMTX_PATH: Record<string, string> = { go2: "robot", g1: "g1" };

/**
 * The WHEP URL for `robot`, built from the configured one by swapping its path segment.
 * `base` is whatever WHEP_URL resolved to (default `…:8889/robot/whep`, or an override).
 * An unknown robot, or a base that does not end in `/<path>/whep`, is returned untouched:
 * a wrong guess here only costs the fall-back to MJPEG, never a broken page.
 */
export function whepUrlFor(base: string, robot: string): string {
  const path = MEDIAMTX_PATH[robot];
  if (!path) return base;
  return base.replace(/\/[^/]+\/whep$/, `/${path}/whep`);
}
