import { useCallback, useEffect, useState } from "react";
import { getRobotVideo, setRobotVideo } from "../../api/backend";
import { IconCamera, IconLoader2 } from "@tabler/icons-react";
import { StatusText, type Status } from "../ui/StatusText";
import { useRobot } from "../layout/RobotContext";
import { msg, useT } from "../../i18n";

/** Button labels for the cameras the robot reports. Unknown names show as-is. Marked with
 * msg(): translated with t() where they are shown. */
const LABELS: Record<string, string> = {
  front: msg("Front camera"),
  rs_color: msg("RealSense color"),
  rs_depth: msg("RealSense depth"),
};

const HINTS: Record<string, string> = {
  front: msg("The robot's own camera"),
  rs_color: msg("The RealSense D435i, colour"),
  rs_depth: msg("The RealSense D435i, depth: near is red, far is blue, black is no reading"),
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
  const t = useT();
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
      setStatus({ tone: "busy", text: t("Switching to {camera}…", { camera: LABELS[camera] ? t(LABELS[camera]) : camera }) });
      try {
        const r = await setRobotVideo({ robot, camera });
        if (r.ok === false) {
          setStatus({ tone: "error", text: r.error ?? t("the robot refused the switch") });
          return;
        }
        const running = r.running?.camera ?? null;
        setCurrent(running);
        if (r.running?.camera_error) {
          // Not a failure of the request: the robot fell back to a camera that works, and
          // this says why the one asked for did not open.
          setStatus({ tone: "warn", text: r.running.camera_error });
        } else if (r.running?.camera_pending) {
          setStatus({ tone: "busy", text: t("The robot is still opening the camera") });
        } else {
          setStatus(null);
        }
      } catch (e) {
        setStatus({ tone: "error", text: t("backend unreachable: {error}", { error: String(e) }) });
      } finally {
        setBusy(false);
      }
    },
    [robot, t],
  );

  if ((robot !== "go2" && robot !== "g1") || cameras.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <label className={`flex h-[34px] items-center gap-1.5 rounded-[10px] border border-line bg-panel pr-1 pl-2.5 transition focus-within:border-accent ${busy ? "opacity-60" : ""}`}
        title={current && HINTS[current] ? t(HINTS[current]) : undefined}>
        {busy ? <IconLoader2 size={15} className="shrink-0 animate-spin text-muted" /> : <IconCamera size={15} className="shrink-0 text-muted" />}
        <select value={current ?? ""} disabled={busy} onChange={(e) => void pick(e.target.value)} aria-label={t("Robot camera")}
          className="cursor-pointer bg-transparent pr-1 text-[12.5px] font-bold text-fg outline-none disabled:cursor-default">
          {current === null && <option value="" disabled>{t("Camera…")}</option>}
          {cameras.map((c) => <option key={c} value={c}>{LABELS[c] ? t(LABELS[c]) : c}</option>)}
        </select>
      </label>
      {status && <StatusText status={status} className="max-w-[220px] truncate text-xs text-muted" />}
    </div>
  );
}
