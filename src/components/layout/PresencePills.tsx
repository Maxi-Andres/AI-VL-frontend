import {
  IconBattery1,
  IconBattery2,
  IconBattery3,
  IconBattery4,
  IconBatteryCharging,
  IconBone,
  IconCpu,
  IconDeviceGamepad2,
  IconPlugConnected,
  IconRobot,
  IconUsers,
} from "@tabler/icons-react";
import { usePresence } from "../../hooks/usePresence";
import { useRobotTransports, type TransportMap } from "../../hooks/useRobotTransports";
import { Pill, type PillTone } from "../ui/Pill";
import type { Presence, RobotInfo } from "../../types";
import { useRobot } from "./RobotContext";

/** Per-robot glyph. The Go2 is a quadruped, so it gets the bone; anything else
 * falls back to the generic robot icon (the registry can grow without touching
 * this — a missing entry is not a bug, just the default). */
const ROBOT_ICONS: Record<string, typeof IconRobot> = {
  go2: IconBone,
};

/** State of one robot.
 *
 * The signal is the backend's PING to the robot's `ping_ip`, not the camera. It used to be
 * the camera ("a robot only reads connected when frames really arrive"), which was honest
 * on the LAN but wrong in the field: with the robot behind the IR1101 the bridge runs in
 * `stream` mode, so `cam.robot` is the literal string "stream" and never equals "go2". The
 * pill then read `offline` while the robot was up, reachable and streaming — measured
 * 2026-09-10. A presence pill has to answer "is the robot there", and only the ping does.
 *
 * The camera and the executor stay in the tooltip: they say what WORKS, which is a
 * different question from whether the robot is reachable.
 */
function robotState(
  p: Presence,
  id: string,
  net: TransportMap | null,
): { tone: PillTone; text: string; title: string } {
  const cam = p.robot_cam;
  const probe = net?.[id];
  // In `stream` mode the bridge pulls an HTTP URL, so cam.robot is the literal "stream" and
  // does not name a robot. It belongs to whichever robot is on the `relay` transport — the
  // one whose stream URL the bridge was pointed at. Matching "stream" for EVERY robot made
  // the G1 report connected off the Go2's video; caught 2026-09-10.
  const isSource = cam.robot === id || (cam.robot === "stream" && probe?.mode === "relay");
  const control = p.executor.online
    ? `control: executor up${p.executor.dry_run ? " (dry run)" : ""}`
    : "control: executor down";

  const camera = !isSource
    ? `camera: not the active source${cam.bridge ? "" : " (bridge down)"}`
    : cam.live
      ? `camera: live, ${cam.fps ? `${Math.round(cam.fps)} fps` : "streaming"}${cam.resolution ? ` @ ${cam.resolution}` : ""}`
      : cam.streaming
        ? "camera: bridge streaming but no frames arrive"
        : "camera: bridge up, not started";

  // A robot with no ping_ip comes back online:false, because the backend pinged an empty
  // string. That is "never measured", NOT "offline" — reporting it as down would repeat the
  // exact bug this function was rewritten to fix, just pointing the other way.
  const probed = Boolean(probe?.ping_ip);

  if (probed && probe?.online === true) {
    return { tone: "good", text: "online", title: `reachable at ${probe.ping_ip} · ${camera} · ${control}` };
  }
  if (probed && probe?.online === false) {
    return {
      tone: "bad",
      text: "offline",
      title: `no ping reply from ${probe?.ping_ip} · ${camera} · ${control}`,
    };
  }

  // Not probed: no ping_ip set, or the first poll is still in flight. Fall back to the
  // camera, which is weaker but better than claiming anything about a robot never measured.
  if (isSource && cam.live) {
    return { tone: "good", text: "connected", title: `${camera} · ${control} (no ping configured)` };
  }
  return {
    tone: "idle",
    text: "unknown",
    title: `no ping address configured for this robot · ${camera} · ${control}`,
  };
}

/**
 * The robot's battery, when its relay has a reading to give.
 *
 * TONE BY CHARGE, not by charging: an operator about to drive wants to know how long they
 * have, and a robot on the dock at 8% is still a robot at 8%.
 *
 * STALENESS IS SHOWN, NOT HIDDEN. A percentage that stopped updating looks perfectly healthy —
 * this is the one number in the header that can be wrong for an hour without looking wrong. A
 * stale reading drops to the idle tone and says so in the tooltip, because the last known
 * value is still worth having as long as nobody mistakes it for now.
 */
function BatteryPill({ net, robotId }: { net: TransportMap | null; robotId: string }) {
  const b = net?.[robotId]?.relay?.battery;
  if (!b || typeof b.percent !== "number") return null;

  const pct = Math.round(b.percent);
  const stale = b.stale === true;
  const tone: PillTone = stale ? "idle" : pct <= 15 ? "bad" : pct <= 35 ? "warn" : "good";
  const Icon = b.charging
    ? IconBatteryCharging
    : pct > 75 ? IconBattery4 : pct > 50 ? IconBattery3 : pct > 25 ? IconBattery2 : IconBattery1;

  const detail = [
    b.charging === true ? "charging" : b.charging === false ? "on battery" : null,
    typeof b.volts === "number" ? `${b.volts.toFixed(1)} V` : null,
    typeof b.current === "number" ? `${(b.current / 1000).toFixed(2)} A` : null,
    typeof b.temp_c === "number" ? `${b.temp_c} °C` : null,
    typeof b.cycles === "number" ? `${b.cycles} cycles` : null,
    stale ? `LAST KNOWN — no reading for ${Math.round(b.age_s ?? 0)} s` : null,
  ].filter(Boolean).join(" · ");

  return (
    <Pill tone={tone} icon={<Icon size={13} stroke={2} />} title={`Battery — ${detail}`}>
      {pct}%
    </Pill>
  );
}

function RobotPill(
  { p, robot, selected, net }:
  { p: Presence; robot: RobotInfo; selected: boolean; net: TransportMap | null },
) {
  const { tone, text, title } = robotState(p, robot.id, net);
  const name = robot.short ?? robot.id.toUpperCase();
  const Icon = ROBOT_ICONS[robot.id] ?? IconRobot;
  return (
    <Pill
      tone={tone}
      dot
      icon={<Icon size={13} stroke={2} />}
      title={`${robot.label} — ${title}${selected ? " · selected for commands" : ""}`}
      className={selected ? "ring-1 ring-line" : ""}
    >
      {name} {text}
    </Pill>
  );
}

/**
 * Header pills saying WHO is connected right now: one per robot (from the robot
 * registry, so it never drifts), one for the browsers on the live session, and one
 * per backing service. A robot only reads "connected" when its camera frames are
 * really reaching the gateway — the honest signal, not a service self-report.
 */
export function PresencePills() {
  const { presence, reachable } = usePresence();
  const net = useRobotTransports();
  const { robots, robot: selected } = useRobot();

  if (!reachable) {
    return (
      <Pill tone="bad" dot icon={<IconPlugConnected size={13} stroke={2} />}
            title="The backend gateway did not answer — nothing else can be reported">
        gateway offline
      </Pill>
    );
  }
  if (!presence) return null; // first poll in flight

  const { web, robot_cam, executor, iacore } = presence;
  const testSource = robot_cam.robot === "test" && robot_cam.live;

  return (
    <>
      {robots.map((r) => (
        <RobotPill key={r.id} p={presence} robot={r} selected={r.id === selected} net={net} />
      ))}

      {/* Only the robot being driven. One battery is a fact the operator acts on; one per
          robot in the registry is a row of numbers nobody reads. */}
      {selected && <BatteryPill net={net} robotId={selected} />}

      {testSource && (
        <Pill tone="warn" dot title="The camera bridge is streaming its synthetic test pattern">
          test pattern
        </Pill>
      )}

      <Pill
        tone={web.total > 0 ? "good" : "idle"}
        icon={<IconUsers size={13} stroke={2} />}
        title={`${web.producers} streaming a camera · ${web.viewers} watching`}
      >
        {web.total} web
      </Pill>

      <Pill
        tone={executor.online ? "good" : "bad"}
        icon={<IconDeviceGamepad2 size={13} stroke={2} />}
        title={
          executor.online
            ? `Robot executor up${executor.safe_mode ? " · safe mode" : ""}${
                executor.dry_run ? " · dry run" : ""
              }`
            : "Robot executor unreachable — commands cannot move a robot"
        }
        className="hidden sm:inline-flex"
      >
        executor
      </Pill>

      <Pill
        tone={iacore.online ? "good" : "bad"}
        icon={<IconCpu size={13} stroke={2} />}
        title={
          iacore.online
            ? "Inference service up (YOLO / VLM / speech)"
            : "Inference service unreachable — no detection, VLM or speech"
        }
        className="hidden sm:inline-flex"
      >
        iacore
      </Pill>
    </>
  );
}
