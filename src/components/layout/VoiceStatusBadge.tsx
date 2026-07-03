import {
  IconLoader2,
  IconMicrophone,
  IconMicrophoneFilled,
  IconVolume,
} from "@tabler/icons-react";
import type { VoicePhase } from "../../types";

/** Pill in the header showing what the hands-free voice assistant is doing. */
export function VoiceStatusBadge({ phase }: { phase: VoicePhase }) {
  if (phase === "off") return null;

  const map: Record<
    Exclude<VoicePhase, "off">,
    { icon: React.ReactNode; label: string; cls: string }
  > = {
    listening: {
      icon: <IconMicrophone size={13} stroke={2} />,
      label: "Listening for “robot”",
      cls: "bg-[#173a26] text-accent",
    },
    recording: {
      icon: <IconMicrophoneFilled size={13} />,
      label: "Recording…",
      cls: "bg-[#3a2330] text-[#ff9aa6]",
    },
    transcribing: {
      icon: <IconLoader2 size={13} className="animate-spin" />,
      label: "Transcribing…",
      cls: "bg-[#2a2e3a] text-fg",
    },
    thinking: {
      icon: <IconLoader2 size={13} className="animate-spin" />,
      label: "Thinking…",
      cls: "bg-[#2a2e3a] text-fg",
    },
    speaking: {
      icon: <IconVolume size={13} stroke={2} />,
      label: "Speaking…",
      cls: "bg-[#1e2f45] text-[#8fc2ff]",
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
