import { useEffect, useState } from "react";
import {
  getRobotCameraStatus,
  setRobotCameraConfig,
  type RobotCameraConfig,
} from "../../api/backend";

const FPS = [5, 8, 10, 15, 20, 30];
const RES = ["native", "720p", "480p", "360p"];
const QUAL = [0, 90, 70, 50]; // 0 = keep the robot's native JPEG quality
// Where the frames come from. NOT the same as which robot commands target: DDS only works
// while the robot shares this machine's subnet (measured: 122 topics from its own subnet, 2
// from another), whereas "stream" reads the video that already left the robot over HTTP and
// therefore works with the robot anywhere.
// Labelled by METHOD, not by robot: "go2" and "g1" are not two robots here, they are two
// ways of reading a camera over DDS — the Unitree videohub (ready JPEGs) versus a ROS2 image
// topic (RealSense, raw). Both robots answer videohub, so the old per-robot labels were
// misleading. DDS is the LOWER-LATENCY choice and the right one while the robot shares this
// subnet; "stream" is the one that survives the robot being on another network.
const SOURCES = [
  { value: "go2", label: "DDS · videohub (lowest latency)" },
  { value: "g1", label: "DDS · ROS2 image topic (RealSense)" },
  { value: "stream", label: "HTTP stream (any network)" },
  { value: "test", label: "Test pattern" },
];

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
  const [source, setSource] = useState("go2");

  useEffect(() => {
    // This panel lives in a <details>, so it mounts and unmounts as the user opens and
    // closes it — a late answer landing after a close would overwrite the controls with
    // stale values from a previous round.
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
  }, []);

  const push = (patch: RobotCameraConfig) => {
    setRobotCameraConfig(patch).catch(() => {});
  };

  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-md border border-line px-2 py-1 text-xs text-muted hover:text-fg">
        Camera
      </summary>
      <div className="absolute right-0 z-30 mt-1 w-52 space-y-2 rounded-md border border-line bg-panel p-2.5 shadow-lg">
        <label className="block text-[11px] text-muted">
          Source
          <select
            className={selCls}
            value={source}
            onChange={(e) => {
              const v = e.target.value;
              setSource(v);
              push({ robot: v });
            }}
          >
            {SOURCES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <span className="mt-0.5 block text-[10px] leading-tight text-muted/70">
            {source === "stream"
              ? "Over HTTP: works anywhere, but more hops — higher latency"
              : source === "test"
                ? "Synthetic frames, no robot needed"
                : "Over DDS: lowest latency, but only on the robot's own subnet"}
          </span>
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
        <p className="m-0 text-[10px] leading-tight text-muted">
          Lower = less latency for remote viewers. Non-native re-encodes on the
          bridge.
        </p>
      </div>
    </details>
  );
}
