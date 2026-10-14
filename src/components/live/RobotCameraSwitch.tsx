import { useCallback, useEffect, useState } from "react";
import { getRobotVideo, setRobotVideo } from "../../api/backend";
import { Button } from "../ui/Button";
import { StatusText, type Status } from "../ui/StatusText";
import { useRobot } from "../layout/RobotContext";

/** Button labels for the cameras the robot reports. Unknown names show as-is. */
const LABELS: Record<string, string> = {
  front: "Front",
  rs_color: "RealSense",
  rs_depth: "Depth",
};

const HINTS: Record<string, string> = {
  front: "The robot's own camera",
  rs_color: "The RealSense D435i, colour",
  rs_depth: "The RealSense D435i, depth: near is red, far is blue, black is no reading",
};

/**
 * Pick WHICH camera the robot sends. One at a time, by design: the robot stops the camera it
 * leaves, so the link carries a single picture whichever is chosen. Every view of the robot
 * (MJPEG, H.264, intra, the NVR) follows the switch, because it happens on the robot, upstream
 * of all of them.
 *
 * Go2 and G1. Each robot says which cameras it has: the Go2 offers all three; the G1 offers its
 * front camera and the depth, because its RealSense colour IS its front camera.
 *
 * Renders nothing until the robot reports its cameras, so a robot running an older video
 * service simply shows no switch instead of buttons that can only fail.
 */
export function RobotCameraSwitch() {
  const { robot } = useRobot();
  const [cameras, setCameras] = useState<string[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (robot !== "go2" && robot !== "g1") return;
    const ctl = new AbortController();
    getRobotVideo(robot, ctl.signal)
      .then((s) => {
        setCameras(s.cameras ?? []);
        setCurrent(s.running?.camera ?? null);
        if (s.running?.camera_error) {
          setStatus({ tone: "warn", text: s.running.camera_error });
        }
      })
      .catch(() => {
        /* aborted or unreachable: the switch just stays hidden */
      });
    return () => ctl.abort();
  }, [robot]);

  const pick = useCallback(
    async (camera: string) => {
      setBusy(true);
      setStatus({ tone: "busy", text: `Switching to ${LABELS[camera] ?? camera}…` });
      try {
        const r = await setRobotVideo({ robot, camera });
        if (r.ok === false) {
          setStatus({ tone: "error", text: r.error ?? "the robot refused the switch" });
          return;
        }
        const running = r.running?.camera ?? null;
        setCurrent(running);
        if (r.running?.camera_error) {
          // Not a failure of the request: the robot fell back to a camera that works, and
          // this says why the one asked for did not open.
          setStatus({ tone: "warn", text: r.running.camera_error });
        } else if (r.running?.camera_pending) {
          setStatus({ tone: "busy", text: "The robot is still opening the camera" });
        } else {
          setStatus(null);
        }
      } catch (e) {
        setStatus({ tone: "error", text: `backend unreachable: ${String(e)}` });
      } finally {
        setBusy(false);
      }
    },
    [robot],
  );

  if ((robot !== "go2" && robot !== "g1") || cameras.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <span className="text-xs text-muted">Camera</span>
      {cameras.map((c) => (
        <Button
          key={c}
          variant={current === c ? "primary" : "secondary"}
          onClick={() => pick(c)}
          disabled={busy || current === c}
          title={HINTS[c]}
        >
          {LABELS[c] ?? c}
        </Button>
      ))}
      <StatusText status={status} className="text-xs text-muted" />
    </div>
  );
}
