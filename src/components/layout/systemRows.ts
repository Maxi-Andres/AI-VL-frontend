import { IconBrain, IconDeviceDesktop, IconSteeringWheel, IconVideo } from "@tabler/icons-react";
import type { Presence, WebPerson } from "../../types";
import { t } from "../../i18n";

// The services behind the robots, in words a customer reads: can the AI see, can a robot be
// moved, is video arriving, who is on the live session. One source for the header's services
// pill and the Fleet System panel, so the two never disagree. Built at render, so t() reads
// the language the components re-rendered for.

export type Tone = "good" | "warn" | "bad" | "idle";

export interface SystemRow {
  key: string;
  icon: typeof IconBrain;
  label: string;
  tone: Tone;
  state: string;
  detail: string;
  /** Counted in "N of M services"; the live session is information, not a service. */
  service: boolean;
}

export function systemRows(p: Presence): SystemRow[] {
  const cam = p.robot_cam;
  const ex = p.executor;
  const people = p.web.people;
  const online = people?.length ?? p.web.total;
  return [
    {
      key: "ai", icon: IconBrain, label: t("AI engine"), service: true,
      ...(p.iacore.online
        ? { tone: "good" as const, state: t("Ready"), detail: t("Detection, vision assistant and voice.") }
        : { tone: "bad" as const, state: t("Down"), detail: t("Detection and the vision assistant are paused.") }),
    },
    {
      key: "control", icon: IconSteeringWheel, label: t("Robot control"), service: true,
      ...(!ex.online
        ? { tone: "bad" as const, state: t("Unreachable"), detail: t("Drive and actions are unavailable.") }
        : ex.dry_run
          ? { tone: "warn" as const, state: t("Dry run"), detail: t("Commands are checked but never sent to a robot.") }
          : { tone: "good" as const, state: t("Ready"), detail: ex.safe_mode ? t("Safe mode on: speed and actions limited.") : t("Commands go to the robot.") }),
    },
    {
      key: "video", icon: IconVideo, label: t("Robot video"), service: true,
      ...(cam.live
        ? { tone: "good" as const, state: t("Live"), detail: [cam.fps ? `${Math.round(cam.fps)} fps` : null, cam.resolution].filter(Boolean).join(" · ") || t("Frames arriving.") }
        : cam.bridge
          ? { tone: "warn" as const, state: t("No frames"), detail: t("The bridge is up but no picture arrives.") }
          : { tone: "idle" as const, state: t("Off"), detail: t("No robot is streaming.") }),
    },
    {
      key: "session", icon: IconDeviceDesktop, label: t("Live session"), service: false,
      tone: online ? "good" : "idle", state: online ? t("{n} online", { n: online }) : t("Idle"),
      // People, not sockets, once the gateway names them: one person on two tabs is one.
      detail: !online ? t("No one is on Live right now.")
        : people
          ? t("{streaming} streaming · {watching} watching", {
            streaming: people.filter((x) => x.streaming).length, watching: people.filter((x) => x.watching).length })
          : t("{streaming} streaming · {watching} watching", { streaming: p.web.producers, watching: p.web.viewers }),
    },
  ];
}

/** What a person on the live session is doing, in words: their own camera going in, the
 * session's picture coming out, or both. What everyone watches is the robot camera while it
 * is live. */
export function personActivity(person: WebPerson, p: Presence): string {
  const robotCam = p.robot_cam.live;
  if (person.streaming && person.watching) {
    return robotCam ? t("Streaming their camera, watching the robot camera") : t("Streaming their camera, watching the live view");
  }
  if (person.streaming) return t("Streaming their camera");
  return robotCam ? t("Watching the robot camera") : t("Watching the live view");
}

export const PILL: Record<Tone, string> = {
  good: "bg-good-bg text-good-fg",
  warn: "bg-warn-bg text-warn-fg",
  bad: "bg-bad-bg text-bad-fg",
  idle: "bg-subtle text-muted",
};
