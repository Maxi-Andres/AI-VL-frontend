import {
  IconBone,
  IconCpu,
  IconDeviceGamepad2,
  IconPlugConnected,
  IconRobot,
  IconUsers,
} from "@tabler/icons-react";
import { usePresence } from "../../hooks/usePresence";
import { Pill, type PillTone } from "../ui/Pill";
import type { Presence, RobotInfo } from "../../types";
import { useRobot } from "./RobotContext";

/** Per-robot glyph. The Go2 is a quadruped, so it gets the bone; anything else
 * falls back to the generic robot icon (the registry can grow without touching
 * this — a missing entry is not a bug, just the default). */
const ROBOT_ICONS: Record<string, typeof IconRobot> = {
  go2: IconBone,
};

/** State of one robot, derived from what the gateway can actually observe. */
function robotState(
  p: Presence,
  id: string,
): { tone: PillTone; text: string; title: string } {
  const cam = p.robot_cam;
  const isSource = cam.robot === id;
  const control = p.executor.online
    ? `control: executor up${p.executor.dry_run ? " (dry run)" : ""}`
    : "control: executor down";

  if (isSource && cam.live) {
    const rate = cam.fps ? `${Math.round(cam.fps)} fps` : "streaming";
    return {
      tone: "good",
      text: "connected",
      title: `camera: live, ${rate}${cam.resolution ? ` @ ${cam.resolution}` : ""} · ${control}`,
    };
  }
  if (isSource && cam.streaming) {
    // The bridge says it is streaming but no frame reached the gateway: the robot
    // stopped publishing, or the bridge's socket is stuck.
    return {
      tone: "bad",
      text: "no frames",
      title: `camera: bridge is streaming but no frames arrive · ${control}`,
    };
  }
  if (isSource && cam.bridge) {
    return {
      tone: "warn",
      text: "standby",
      title: `camera: selected as the source, not started · ${control}`,
    };
  }
  return {
    tone: "idle",
    text: "offline",
    title: `camera: not the active source${cam.bridge ? "" : " (bridge down)"} · ${control}`,
  };
}

function RobotPill({ p, robot, selected }: { p: Presence; robot: RobotInfo; selected: boolean }) {
  const { tone, text, title } = robotState(p, robot.id);
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
        <RobotPill key={r.id} p={presence} robot={r} selected={r.id === selected} />
      ))}

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
