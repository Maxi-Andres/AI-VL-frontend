import {
  IconLoader2,
  IconMicrophone,
  IconMicrophoneFilled,
  IconVolume,
} from "@tabler/icons-react";
import type { VoicePhase } from "../../types";

/** Pill in the header showing what the hands-free voice assistant is doing. */
export function VoiceStatusBadge({
  phase,
  wakeWords = "“robot”",
}: {
  phase: VoicePhase;
  /** What it is listening for: "“robot”" (this device), "“Bender”" (the robot's mic), or both. */
  wakeWords?: string;
}) {
  if (phase === "off") return null;

  const map: Record<
    Exclude<VoicePhase, "off">,
    { icon: React.ReactNode; label: string; cls: string }
  > = {
    listening: {
      icon: <IconMicrophone size={13} stroke={2} />,
      label: `Listening for ${wakeWords || "“robot”"}`,
      cls: "bg-good-bg text-good-fg",
    },
    recording: {
      icon: <IconMicrophoneFilled size={13} />,
      label: "Recording…",
      cls: "bg-bad-bg text-bad-fg",
    },
    transcribing: {
      icon: <IconLoader2 size={13} className="animate-spin" />,
      label: "Transcribing…",
      cls: "bg-subtle text-fg",
    },
    thinking: {
      icon: <IconLoader2 size={13} className="animate-spin" />,
      label: "Thinking…",
      cls: "bg-subtle text-fg",
    },
    speaking: {
      icon: <IconVolume size={13} stroke={2} />,
      label: "Speaking…",
      cls: "bg-info-bg text-info-fg",
    },
  };

  const { icon, label, cls } = map[phase];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${cls}`}
    >
      {icon}
      {label}
    </span>
  );
}
