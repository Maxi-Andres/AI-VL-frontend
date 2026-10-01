import { useEffect, useState } from "react";
import {
  getRobotCameraStatus,
  setRobotCameraConfig,
  type RobotCameraConfig,
} from "../../api/backend";
import { useRobot } from "../layout/RobotContext";

const FPS = [5, 8, 10, 15, 20, 30];
const RES = ["native", "720p", "480p", "360p"];
const QUAL = [0, 90, 70, 50]; // 0 = keep the robot's native JPEG quality

const selCls =
  "w-full rounded-md border border-line bg-bg px-1.5 py-1 text-xs text-fg focus:border-accent focus:outline-none";

/**
 * The SHARED robot-camera stream: FPS / resolution / quality, and the test pattern.
 *
 * WHY THERE IS NO "SOURCE" PICKER ANY MORE. It used to sit in a header popover next to the
 * robot selector, and the two wrote the SAME value on the camera bridge: picking the G1 in the
 * header showed up here as "DDS · ROS2 image topic (RealSense)", which was not even true. Since
 * 2026-10-01 the source simply follows the selected robot (the bridge reads that robot's video
 * over the network, see GO2_STREAM_URL / G1_STREAM_URL), so the only other choice left is the
 * test pattern — a switch, not a list.
 *
 * One change here hits the bridge and affects every viewer (Live and Drive).
 */
export function CameraSettings() {
  const { robot } = useRobot();
  const [fps, setFps] = useState(15);
  const [resolution, setResolution] = useState("native");
  const [quality, setQuality] = useState(0);
  const [source, setSource] = useState("");

  useEffect(() => {
    const ac = new AbortController();
    getRobotCameraStatus(ac.signal)
      .then((s) => {
        if (ac.signal.aborted) return;
        if (typeof s.fps === "number") setFps(Math.round(s.fps));
        if (s.resolution) setResolution(s.resolution);
        if (typeof s.quality === "number") setQuality(s.quality);
        if (s.robot) setSource(s.robot);
      })
      .catch(() => {});
    return () => ac.abort();
  }, [robot]);

  const push = (patch: RobotCameraConfig) => {
    setRobotCameraConfig(patch).catch(() => {});
  };

  const testing = source === "test";

  return (
    <div className="grid max-w-md grid-cols-3 gap-2">
      <label className="col-span-3 flex items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={testing}
          onChange={(e) => {
            const next = e.target.checked ? "test" : robot;
            setSource(next);
            push({ robot: next });
          }}
        />
        Test pattern instead of the {robot} camera (no robot needed)
      </label>
      <label className="block text-[11px] text-muted">
        FPS
        <select
          className={selCls}
          value={fps}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            setFps(v);
            push({ fps: v });
          }}
        >
          {FPS.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </label>
      <label className="block text-[11px] text-muted">
        Resolution
        <select
          className={selCls}
          value={resolution}
          onChange={(e) => {
            setResolution(e.target.value);
            push({ resolution: e.target.value });
          }}
        >
          {RES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </label>
      <label className="block text-[11px] text-muted">
        Quality
        <select
          className={selCls}
          value={quality}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            setQuality(v);
            push({ quality: v });
          }}
        >
          {QUAL.map((q) => (
            <option key={q} value={q}>{q === 0 ? "Native" : q}</option>
          ))}
        </select>
      </label>
      <p className="col-span-3 m-0 text-[11px] leading-tight text-muted">
        Lower = less latency for remote viewers. Anything but Native re-encodes on the bridge.
        This is the MJPEG view only; H.264 is encoded on the robot.
      </p>
    </div>
  );
}
