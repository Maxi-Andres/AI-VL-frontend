import {
  IconLoader2,
  IconMicrophone,
  IconMicrophoneFilled,
  IconVolume,
} from "@tabler/icons-react";
import type { VoicePhase } from "../../types";
import { useT } from "../../i18n";

/** What the hands-free voice assistant is doing, as one icon in the header: the colour says the
 * phase and the words are its tooltip. It was a pill with "Listening for “Bender”" written
 * out, too much for a header that already shows the fleet (2026-10-28). */
export function VoiceStatusBadge({
  phase,
  wakeWords = "“robot”",
}: {
  phase: VoicePhase;
  /** What it is listening for: "“robot”" (this device), "“Bender”" (the robot's mic), or both. */
  wakeWords?: string;
}) {
  const t = useT();
  if (phase === "off") return null;

  const map: Record<
    Exclude<VoicePhase, "off">,
    { icon: React.ReactNode; label: string; cls: string }
  > = {
    listening: {
      icon: <IconMicrophone size={17} stroke={2} />,
      label: t("Listening for {words}", { words: wakeWords || "“robot”" }),
      cls: "bg-good-bg text-good-fg",
    },
    recording: {
      icon: <IconMicrophoneFilled size={17} className="animate-pulse" />,
      label: t("Recording…"),
      cls: "bg-bad-bg text-bad-fg",
    },
    transcribing: {
      icon: <IconLoader2 size={17} className="animate-spin" />,
      label: t("Transcribing…"),
      cls: "bg-subtle text-fg",
    },
    thinking: {
      icon: <IconLoader2 size={17} className="animate-spin" />,
      label: t("Thinking…"),
      cls: "bg-subtle text-fg",
    },
    speaking: {
      icon: <IconVolume size={17} stroke={2} />,
      label: t("Speaking…"),
      cls: "bg-info-bg text-info-fg",
    },
  };

  const { icon, label, cls } = map[phase];
  return (
    <span role="status" title={label} aria-label={label}
      className={`grid size-9 shrink-0 place-items-center rounded-lg ${cls}`}>
      {icon}
    </span>
  );
}
