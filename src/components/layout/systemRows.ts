import { IconBrain, IconDeviceDesktop, IconSteeringWheel, IconVideo } from "@tabler/icons-react";
import type { Presence, WebPerson } from "../../types";

// The services behind the robots, in words a customer reads: can the AI see, can a robot be
// moved, is video arriving, who is on the live session. One source for the header's services
// pill and the Fleet System panel, so the two never disagree.

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
      key: "ai", icon: IconBrain, label: "AI engine", service: true,
      ...(p.iacore.online
        ? { tone: "good" as const, state: "Ready", detail: "Detection, vision assistant and voice." }
        : { tone: "bad" as const, state: "Down", detail: "Detection and the vision assistant are paused." }),
    },
    {
      key: "control", icon: IconSteeringWheel, label: "Robot control", service: true,
      ...(!ex.online
        ? { tone: "bad" as const, state: "Unreachable", detail: "Drive and actions are unavailable." }
        : ex.dry_run
          ? { tone: "warn" as const, state: "Dry run", detail: "Commands are checked but never sent to a robot." }
          : { tone: "good" as const, state: "Ready", detail: ex.safe_mode ? "Safe mode on: speed and actions limited." : "Commands go to the robot." }),
    },
    {
      key: "video", icon: IconVideo, label: "Robot video", service: true,
      ...(cam.live
        ? { tone: "good" as const, state: "Live", detail: [cam.fps ? `${Math.round(cam.fps)} fps` : null, cam.resolution].filter(Boolean).join(" · ") || "Frames arriving." }
        : cam.bridge
          ? { tone: "warn" as const, state: "No frames", detail: "The bridge is up but no picture arrives." }
          : { tone: "idle" as const, state: "Off", detail: "No robot is streaming." }),
    },
    {
      key: "session", icon: IconDeviceDesktop, label: "Live session", service: false,
      tone: online ? "good" : "idle", state: online ? `${online} online` : "Idle",
      // People, not sockets, once the gateway names them: one person on two tabs is one.
      detail: !online ? "No one is on Live right now."
        : people ? `${people.filter((x) => x.streaming).length} streaming · ${people.filter((x) => x.watching).length} watching`
          : `${p.web.producers} streaming · ${p.web.viewers} watching`,
    },
  ];
}

/** What a person on the live session is doing, in words: their own camera going in, the
 * session's picture coming out, or both. What everyone watches is the robot camera while it
 * is live. */
export function personActivity(person: WebPerson, p: Presence): string {
  const watching = p.robot_cam.live ? "watching the robot camera" : "watching the live view";
  if (person.streaming && person.watching) return `Streaming their camera, ${watching}`;
  if (person.streaming) return "Streaming their camera";
  return watching[0].toUpperCase() + watching.slice(1);
}

export const PILL: Record<Tone, string> = {
  good: "bg-good-bg text-good-fg",
  warn: "bg-warn-bg text-warn-fg",
  bad: "bg-bad-bg text-bad-fg",
  idle: "bg-subtle text-muted",
};
