import { IconBrain, IconCpu, IconEye, IconSteeringWheel, IconVideo } from "@tabler/icons-react";
import type { Presence, WebPerson } from "../../types";
import { t } from "../../i18n";

// The services behind the robots, in words a customer reads: the processes that have to be
// running — the AI engine, the vision assistant, robot control, the camera link — and the GPU
// they share. One source for the header's services pill and the Fleet System panel, so the two
// never disagree. Built at render, so t() reads the language the components re-rendered for.
//
// Not here on purpose (2026-10-27): "Live session" (who is on Live — that is the people list)
// and "Robot video: No frames" (the state of a stream, not of a service). The camera link row
// says whether the bridge process runs, and whether it is streaming right now.

export type Tone = "good" | "warn" | "bad" | "idle";

export interface SystemRow {
  key: string;
  icon: typeof IconBrain;
  label: string;
  tone: Tone;
  state: string;
  detail: string;
  /** Counted in "N of M up"; the GPU is a resource the services share, not a service. */
  service: boolean;
  /** A 0-1 fill drawn under the tile (the GPU's memory). */
  meter?: number;
}

// GPU memory past these fractions is a warning, then a problem: a full card froze the whole
// browser on entering fullscreen (2026-10-27, .claude/roadmap/PLATAFORMA.md §7.6).
const GPU_WARN = 0.85;
const GPU_BAD = 0.95;

export function systemRows(p: Presence): SystemRow[] {
  const cam = p.robot_cam;
  const ex = p.executor;
  const vlm = p.iacore.online ? p.iacore.vlm : null;
  const gpu = p.iacore.online ? p.iacore.gpu : null;
  const rows: SystemRow[] = [
    {
      key: "ai", icon: IconBrain, label: t("AI engine"), service: true,
      ...(p.iacore.online
        ? { tone: "good" as const, state: t("Ready"), detail: t("Detection and voice.") }
        : { tone: "bad" as const, state: t("Down"), detail: t("Detection, voice and the vision assistant are paused.") }),
    },
  ];
  if (vlm) {
    rows.push({
      key: "vlm", icon: IconEye, label: t("Vision assistant"), service: true,
      ...(vlm.online
        ? { tone: "good" as const, state: t("Ready"), detail: t("Answers questions about the picture.") }
        : { tone: "bad" as const, state: t("Down"), detail: t("Ask VLM and the robot's spoken answers are unavailable.") }),
    });
  }
  rows.push(
    {
      key: "control", icon: IconSteeringWheel, label: t("Robot control"), service: true,
      ...(!ex.online
        ? { tone: "bad" as const, state: t("Unreachable"), detail: t("Drive and actions are unavailable.") }
        : ex.dry_run
          ? { tone: "warn" as const, state: t("Dry run"), detail: t("Commands are checked but never sent to a robot.") }
          : { tone: "good" as const, state: t("Ready"), detail: ex.safe_mode ? t("Safe mode on: speed and actions limited.") : t("Commands go to the robot.") }),
    },
    {
      key: "camera", icon: IconVideo, label: t("Camera link"), service: true,
      ...(!cam.bridge
        ? { tone: "idle" as const, state: t("Off"), detail: t("The camera bridge is not running on this server.") }
        : cam.live
          ? { tone: "good" as const, state: t("Streaming"), detail: [cam.fps ? `${Math.round(cam.fps)} fps` : null, cam.resolution].filter(Boolean).join(" · ") || t("Frames arriving.") }
          : { tone: "good" as const, state: t("Ready"), detail: t("Running; no robot camera is streaming right now.") }),
    },
  );
  if (gpu && gpu.total_mb > 0) {
    const used = gpu.used_mb / gpu.total_mb;
    rows.push({
      key: "gpu", icon: IconCpu, label: t("GPU memory"), service: false, meter: used,
      tone: used >= GPU_BAD ? "bad" : used >= GPU_WARN ? "warn" : "good",
      state: `${(gpu.used_mb / 1024).toFixed(1)} / ${(gpu.total_mb / 1024).toFixed(1)} GB`,
      detail: used >= GPU_WARN
        ? t("{pct}% used — nearly full: fullscreen video or a bigger model can freeze this machine.", { pct: Math.round(used * 100) })
        : t("{pct}% used{name}", { pct: Math.round(used * 100), name: gpu.name ? ` · ${gpu.name}` : "" }),
    });
  }
  return rows;
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
