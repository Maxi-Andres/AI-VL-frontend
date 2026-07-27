import { useEffect, useState } from "react";
import {
  getRobotCameraStatus,
  setRobotCameraConfig,
  type RobotCameraConfig,
} from "../../api/backend";

const FPS = [5, 8, 10, 15, 20, 30];
const RES = ["native", "720p", "480p", "360p"];
const QUAL = [0, 90, 70, 50]; // 0 = keep the robot's native JPEG quality

const selCls =
  "w-full rounded-md border border-line bg-bg px-1.5 py-1 text-xs text-fg focus:border-accent focus:outline-none";

/**
 * Header control for the SHARED robot-camera source: FPS / resolution / quality.
 * One change hits the bridge and affects every viewer (the unified Live view and
 * Drive). Uses a native <details> popover so there's no click-outside logic.
 */
export function CameraControls() {
  const [fps, setFps] = useState(15);
  const [resolution, setResolution] = useState("native");
  const [quality, setQuality] = useState(0);

  useEffect(() => {
    getRobotCameraStatus()
      .then((s) => {
        if (typeof s.fps === "number") setFps(Math.round(s.fps));
        if (s.resolution) setResolution(s.resolution);
        if (typeof s.quality === "number") setQuality(s.quality);
      })
      .catch(() => {});
  }, []);

  const push = (patch: RobotCameraConfig) => {
    setRobotCameraConfig(patch).catch(() => {});
  };

  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-md border border-line px-2 py-1 text-xs text-muted hover:text-fg">
        Camera
      </summary>
      <div className="absolute right-0 z-30 mt-1 w-44 space-y-2 rounded-md border border-line bg-panel p-2.5 shadow-lg">
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
        <p className="m-0 text-[10px] leading-tight text-muted">
          Lower = less latency for remote viewers. Non-native re-encodes on the
          bridge.
        </p>
      </div>
    </details>
  );
}
